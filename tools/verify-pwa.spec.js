const { test, expect } = require("@playwright/test");

const DB_NAME = "miga-pos-local";
const STORE_NAMES = [
  "categorias",
  "productos",
  "produccion_diaria",
  "ventas",
  "detalle_venta",
  "movimientos_stock",
  "configuracion",
  "cierres_diarios"
];

async function clearIndexedDb(page) {
  await page.evaluate(async ({ dbName, storeNames }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, "readwrite");
      for (const storeName of storeNames) tx.objectStore(storeName).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, { dbName: DB_NAME, storeNames: STORE_NAMES });
}

async function downloadText(download) {
  return download.createReadStream().then((stream) => {
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
  });
}

test("QA completo: ventas, stock, produccion, historial, persistencia, offline y backup", async ({ page }) => {
  const externalRequests = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://127.0.0.1:4185/") && !url.startsWith("blob:") && !url.startsWith("data:")) {
      externalRequests.push(url);
    }
  });

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("http://127.0.0.1:4185/");
  await clearIndexedDb(page);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Caja" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Cortado/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Coca cola/ })).toBeEnabled();

  const cajaButtonBox = await page.getByRole("button", { name: "Caja" }).boundingBox();
  const productButtonBox = await page.getByRole("button", { name: /Cortado/ }).boundingBox();
  expect(cajaButtonBox.height).toBeGreaterThanOrEqual(46);
  expect(productButtonBox.height).toBeGreaterThanOrEqual(100);

  await page.getByRole("button", { name: "Produccion" }).click();
  await expect(page.locator("#production-product")).not.toContainText("Croissant");
  await expect(page.locator("#manual-stock-fields")).toContainText("Croissant");

  const croissantInput = page.locator('#manual-stock-fields input[data-product-id="croissant"]');
  await expect(croissantInput).toHaveValue("0");
  await croissantInput.focus();
  await expect(croissantInput).toHaveValue("");
  await croissantInput.fill("1.5");
  await page.getByRole("button", { name: "Guardar stock de bolleria" }).click();
  await expect(page.getByText("El stock debe ser un numero entero no negativo.")).toBeVisible();
  await croissantInput.fill("12");
  await page.getByRole("button", { name: "Guardar stock de bolleria" }).click();
  await expect(page.getByText("Stock manual guardado.")).toBeVisible();
  await expect(page.locator('#manual-stock-fields input[data-product-id="croissant"]')).toHaveValue("12");

  await page.locator("#production-product").selectOption("jamon-queso");
  await page.locator("#production-quantity").fill("2.5");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("La produccion debe ser un numero entero.")).toBeVisible();
  await page.locator("#production-quantity").fill("2");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Produccion guardada.")).toBeVisible();
  await expect(page.locator("#production-product")).toHaveValue("pasta-oliva-queso");
  await expect(page.locator("#production-sandwiches-list")).toContainText("2");
  await page.locator("#production-product").selectOption("jamon-queso");
  await page.locator("#production-quantity").fill("-3");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("No se puede descontar 3 de Jamon y queso. Stock actual: 2.")).toBeVisible();

  await page.getByRole("button", { name: "Stock", exact: true }).click();
  await expect(page.locator("#stock-list")).toContainText("Jamon y queso");
  await expect(page.locator("#stock-list")).toContainText("Stock bajo");
  await expect(page.locator("#stock-list")).toContainText("Sin stock");

  await page.getByRole("button", { name: "Caja" }).click();
  await page.getByRole("button", { name: /Jamon y queso/ }).click();
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toContainText("1 disp.");
  await page.getByRole("button", { name: /Jamon y queso/ }).click();
  await expect(page.locator("#cart-total")).toContainText("7,00");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toBeDisabled();
  await page.locator("#cart-items .cart-line").first().getByRole("button", { name: "Restar" }).click();
  await expect(page.locator("#cart-total")).toContainText("3,50");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toContainText("1 disp.");
  await page.locator("#cart-items .cart-line").first().getByRole("button", { name: "Sumar" }).click();
  await expect(page.locator("#cart-total")).toContainText("7,00");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toBeDisabled();
  await page.locator("#cart-items .cart-line").first().getByRole("button", { name: "Restar" }).click();
  await page.locator("#cart-items .cart-line").first().getByRole("button", { name: "Restar" }).click();
  await expect(page.locator("#cart-items")).toContainText("Sin productos.");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toContainText("2 disp.");

  await page.getByRole("button", { name: /Cortado/ }).click();
  await expect(page.locator("#cart-total")).toContainText("2,00");
  await page.getByRole("button", { name: "Vaciar" }).click();
  await expect(page.locator("#cart-items")).toContainText("Sin productos.");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toContainText("2 disp.");

  await page.getByRole("button", { name: /Jamon y queso/ }).click();
  await page.getByRole("button", { name: /Jamon y queso/ }).click();
  await page.getByRole("button", { name: "Confirmar venta" }).dblclick();
  await expect(page.locator("#sale-message")).toContainText("Venta #1 confirmada.");
  await expect(page.locator("#cart-items")).toContainText("Sin productos.");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toBeDisabled();

  await page.getByRole("button", { name: /Jamon y queso/ }).click({ force: true });
  await expect(page.locator("#cart-items")).toContainText("Sin productos.");

  await page.locator("#togoo-product").selectOption("croissant");
  await page.locator("#togoo-quantity").fill("1.5");
  await page.getByRole("button", { name: "Registrar salida ToGoo" }).click();
  await expect(page.getByText("La cantidad de ToGoo debe ser un entero mayor a 0.")).toBeVisible();
  await page.locator("#togoo-quantity").fill("1");
  await page.getByRole("button", { name: "Registrar salida ToGoo" }).dblclick();
  await expect(page.getByText("Salida ToGoo registrada como venta #2.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Croissant/ })).toContainText("11 disp.");

  await page.locator("#baja-product").selectOption("croissant");
  await page.locator("#baja-quantity").fill("1.5");
  await page.getByRole("button", { name: "Registrar BAJA" }).click();
  await expect(page.getByText("La cantidad de BAJA debe ser un entero mayor a 0.")).toBeVisible();
  await page.locator("#baja-quantity").fill("1");
  await page.getByRole("button", { name: "Registrar BAJA" }).dblclick();
  await expect(page.getByText("BAJA registrada como salida #3.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Croissant/ })).toContainText("10 disp.");

  await page.reload();
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Croissant/ })).toContainText("11 disp.");

  await page.getByRole("button", { name: "Historial" }).click();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "Venta #1" })).toBeVisible();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "ToGoo #2" })).toBeVisible();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "Baja #3" })).toBeVisible();
  await expect(page.getByText("2 x Jamon y queso - 7,00")).toBeVisible();
  await expect(page.getByText("1 x Croissant ToGoo - 0,60")).toBeVisible();
  await expect(page.getByText("1 x Croissant BAJA - 0,00")).toBeVisible();

  const txtDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar resumen TXT" }).click();
  const txtDownload = await txtDownloadPromise;
  expect(txtDownload.suggestedFilename()).toMatch(/miga-pos-resumen-.*\.txt/);
  const summaryText = await downloadText(txtDownload);
  expect(summaryText).toContain("SANDWICHES");
  expect(summaryText).toContain("- Jamon y queso");
  expect(summaryText).toContain("Total venta pura: 7,00");
  expect(summaryText).toContain("Total ToGood: 0,60");
  expect(summaryText).toContain("Total BAJA: 0,00");
  expect(summaryText).toContain("Total general: 7,60");
  expect(summaryText).toContain("TOGOOD");
  expect(summaryText).toContain("- Croissant - 0,60");
  expect(summaryText).toContain("BAJA");
  expect(summaryText).toContain("- Croissant - 0,00");
  expect(summaryText).toContain("DETALLE DE VENTAS PURAS");
  expect(summaryText).not.toContain("1 x Croissant ToGoo");
  expect(summaryText).not.toContain("1 x Croissant BAJA");
  expect(summaryText).not.toContain("Precio promedio");
  expect(summaryText).not.toContain("Aparece en ventas");

  const jsonDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar backup JSON" }).click();
  const jsonDownload = await jsonDownloadPromise;
  expect(jsonDownload.suggestedFilename()).toMatch(/miga-pos-backup-.*\.json/);
  const jsonPath = await jsonDownload.path();
  const jsonText = await downloadText(jsonDownload);
  expect(JSON.parse(jsonText).app).toBe("Miga POS PWA");

  await clearIndexedDb(page);
  await page.reload();
  await page.getByRole("button", { name: "Historial" }).click();
  await expect(page.getByText("No hay ventas registradas para esta fecha.")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#import-full-backup").setInputFiles(jsonPath);
  await expect(page.getByText("Backup importado correctamente.")).toBeVisible();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "Venta #1" })).toBeVisible();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "ToGoo #2" })).toBeVisible();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "Baja #3" })).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ventas del dia" })).toBeVisible();
  await page.getByRole("button", { name: "Caja" }).click();
  await page.getByRole("button", { name: /Cortado/ }).click();
  await page.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(page.locator("#sale-message")).toContainText("Venta #4 confirmada.");
  await page.getByRole("button", { name: "Historial" }).click();
  await expect(page.locator("#history-list .sale-row h2", { hasText: "Venta #4" })).toBeVisible();
  await expect(page.getByText("1 x Cortado - 2,00")).toBeVisible();
  await page.context().setOffline(false);

  await page.setViewportSize({ width: 1180, height: 820 });
  await page.getByRole("button", { name: "Caja" }).click();
  const cartBox = await page.locator(".cart-panel").boundingBox();
  const pageBox = await page.locator(".page").boundingBox();
  expect(cartBox.x).toBeGreaterThan(pageBox.x + 500);
  expect(externalRequests).toEqual([]);
});

test("combo automatico de 6 sandwiches con serrano basico y un premium", async ({ page }) => {
  await page.goto("http://127.0.0.1:4185/");
  await clearIndexedDb(page);
  await page.reload();

  await page.getByRole("button", { name: "Produccion" }).click();
  await page.locator("#production-product").selectOption("jamon-queso");
  await page.locator("#production-quantity").fill("4");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Produccion guardada.")).toBeVisible();
  await page.locator("#production-product").selectOption("jamon-serrano-rucula");
  await page.locator("#production-quantity").fill("1");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Produccion guardada.")).toBeVisible();
  await page.locator("#production-product").selectOption("salmon-phil");
  await page.locator("#production-quantity").fill("2");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Produccion guardada.")).toBeVisible();
  await page.locator("#production-product").selectOption("pasta-oliva-queso");
  await page.locator("#production-quantity").fill("6");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Produccion guardada.")).toBeVisible();

  await page.getByRole("button", { name: "Caja" }).click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByRole("button", { name: /Jamon y queso/ }).click();
  }
  await page.getByRole("button", { name: /Jamon serrano y rucula/ }).click();
  await page.getByRole("button", { name: /Salmon ahumado y phil/ }).click();

  await expect(page.locator("#cart-total")).toContainText("20,00");
  await expect(page.locator(".combo-summary")).toContainText("Combo 6 sandwiches");
  await expect(page.locator(".combo-summary")).toContainText("Valor real del combo: 21,30");
  await expect(page.getByRole("button", { name: /Jamon y queso/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Jamon serrano y rucula/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Salmon ahumado y phil/ })).toContainText("1 disp.");

  await page.getByRole("button", { name: /Pasta Oliva y queso/ }).click();
  await expect(page.locator("#cart-total")).toContainText("23,50");
  await expect(page.locator(".combo-summary")).toContainText("Combo 6 sandwiches");
  await page.locator("#cart-items .cart-line", { hasText: "Pasta Oliva y queso" }).getByRole("button", { name: "Restar" }).click();
  await expect(page.locator("#cart-total")).toContainText("20,00");

  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: /Pasta Oliva y queso/ }).click();
  }
  await expect(page.locator("#cart-total")).toContainText("40,00");
  await expect(page.locator(".combo-summary")).toContainText("Combo 12 sandwiches");
  await expect(page.locator(".combo-summary")).toContainText("Valor real del combo: 42,30");

  await page.getByRole("button", { name: /Salmon ahumado y phil/ }).click();
  await expect(page.locator("#cart-total")).toContainText("43,80");
  await expect(page.locator(".combo-summary")).toContainText("Combo 12 sandwiches");

  await page.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(page.locator("#sale-message")).toContainText("Venta #1 confirmada.");

  await page.getByRole("button", { name: "Historial" }).click();
  await expect(page.locator("#history-list .sale-row").first()).toContainText("43,80");
  await expect(page.getByText("4 x Jamon y queso - 14,00")).toBeVisible();
  await expect(page.getByText("1 x Jamon serrano y rucula - 3,50")).toBeVisible();
  await expect(page.getByText("2 x Salmon ahumado y phil - 7,60")).toBeVisible();
  await expect(page.getByText("6 x Pasta Oliva y queso - 21,00")).toBeVisible();
  await expect(page.getByText("1 x Descuento Combo 12 sandwiches - -2,30")).toBeVisible();
});

test("migra productos existentes para que el combo se vea en instalaciones usadas", async ({ page }) => {
  await page.goto("http://127.0.0.1:4185/");
  await clearIndexedDb(page);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("miga-pos-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["productos"], "readwrite");
      const store = tx.objectStore("productos");
      store.put({
        id: "salmon-phil",
        categoriaId: "sandwiches",
        nombre: "Salmon ahumado y phil",
        precioCentavos: 410,
        stockActual: 6,
        umbralBajo: 10,
        controlaStock: true,
        orden: 9,
        activo: true
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });

  await page.reload();
  const salmon = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("miga-pos-local");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const product = await new Promise((resolve, reject) => {
      const request = db.transaction("productos", "readonly").objectStore("productos").get("salmon-phil");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return product;
  });
  expect(salmon.sandwichTipo).toBe("premium");
  expect(salmon.stockActual).toBe(6);
});

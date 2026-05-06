const { chromium } = require("playwright");
const assert = require("node:assert/strict");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:4185/");
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase("miga-pos-local");
        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
        request.onblocked = resolve;
      });
    });
    await page.reload();

    await page.getByRole("heading", { name: "Caja" }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Jamon y queso/ }).isDisabled(), true);

    await page.getByRole("button", { name: "Produccion" }).click();
    await page.locator("#production-product").selectOption("jamon-queso");
    await page.locator("#production-quantity").fill("2");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.getByText("Produccion guardada.").waitFor();

    await page.getByRole("button", { name: "Caja" }).click();
    await page.getByRole("button", { name: /Jamon y queso/ }).click();
    await page.getByRole("button", { name: /Jamon y queso/ }).click();
    await page.getByRole("button", { name: "Confirmar venta" }).click();
    await page.locator("#sale-message").getByText("Venta #1 confirmada.").waitFor();
    assert.equal(await page.getByRole("button", { name: /Jamon y queso/ }).isDisabled(), true);

    await page.getByRole("button", { name: "Historial" }).click();
    await page.getByText("Venta #1").waitFor();
    await page.getByText("2 x Jamon y queso").waitFor();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar JSON" }).click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /miga-pos-backup-.*\.json/);

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Importar JSON").setInputFiles(await download.path());
    await page.getByText("Backup importado correctamente.").waitFor();

    console.log("OK: produccion, venta, historial, export/import y persistencia IndexedDB verificados.");
  } finally {
    await browser.close();
  }
})();

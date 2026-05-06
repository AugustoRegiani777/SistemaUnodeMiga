import { exportAllData, getAll, importAllData } from "../db/idb.js";
import { listProducts, productionSnapshot, salesForDay } from "./business.js";
import { centsToMoney, downloadText, normalizeText, todayISO } from "../utils/format.js";

const FALLBACK_CATEGORIES = [
  {
    categoria: "Sandwiches",
    names: [
      "jamon y queso",
      "pasta oliva y queso",
      "pimiento asado, gouda, philp",
      "pesto y tomate",
      "pesto, tomate y queso",
      "berenjena y queso brie",
      "jamon serrano y rucula",
      "atun, palta y queso",
      "salmon ahumado y phil",
      "especial semanal"
    ]
  },
  {
    categoria: "Bolleria",
    names: ["croissant", "mini croissant", "mini croissant ddl", "pain au chocolat"]
  },
  {
    categoria: "Cafe",
    names: ["expresso 30ml", "cortado", "latte", "cafe con leche", "capuccino", "americano", "flat white"]
  },
  {
    categoria: "Bebidas",
    names: ["cerveza", "coca cola", "sprite", "nestea", "aquiarios", "jugo", "agua"]
  }
];

function inferCategory(productName) {
  const normalizedName = normalizeText(productName);
  const match = FALLBACK_CATEGORIES.find((group) =>
    group.names.some((name) => normalizeText(name) === normalizedName)
  );
  return match?.categoria || "Otros";
}

function addTripleSpace(lines) {
  lines.push("", "", "");
}

function isToGoodDetail(detail) {
  return detail.productoNombre.includes("ToGoo");
}

function isBajaDetail(detail) {
  return detail.productoNombre.includes("BAJA");
}

function isDiscountDetail(detail) {
  return detail.productoNombre.startsWith("Descuento ");
}

function cleanToGoodName(productName) {
  return productName.replace(/\s+ToGoo$/, "");
}

function cleanBajaName(productName) {
  return productName.replace(/\s+BAJA$/, "");
}

export async function exportSalesSummary(fecha) {
  const sales = await salesForDay(fecha);
  const products = await listProducts();
  const snapshot = await productionSnapshot(fecha);
  const productsById = new Map(products.map((product) => [product.id, product]));
  const productsByName = new Map(products.map((product) => [normalizeText(product.nombre), product]));
  const stockAdjustments = (await getAll("movimientos_stock"))
    .filter((movement) => movement.fecha === fecha && movement.tipo === "ajuste_stock")
    .sort((a, b) => String(a.creadoEn || "").localeCompare(String(b.creadoEn || "")));
  const summary = new Map();
  const toGoodItems = [];
  const bajaItems = [];
  const totalSandwichesProduced = snapshot.sandwiches.reduce(
    (total, product) => total + (Number(product.cantidadProducida) || 0),
    0
  );
  let totalVentaPuraCentavos = 0;
  let totalToGoodCentavos = 0;
  let totalBajaCentavos = 0;

  for (const sale of sales) {
    for (const detail of sale.detalles) {
      if (isToGoodDetail(detail)) {
        toGoodItems.push({ sale, detail });
        totalToGoodCentavos += detail.subtotalCentavos;
        continue;
      }
      if (isBajaDetail(detail)) {
        bajaItems.push({ sale, detail });
        totalBajaCentavos += detail.subtotalCentavos;
        continue;
      }

      totalVentaPuraCentavos += detail.subtotalCentavos;
      if (isDiscountDetail(detail)) continue;

      const product = productsById.get(detail.productoId) || productsByName.get(normalizeText(detail.productoNombre));
      const key = product?.id || normalizeText(detail.productoNombre);
      const row = summary.get(key) || {
        categoria: product?.categoria || inferCategory(detail.productoNombre),
        producto: product?.nombre || detail.productoNombre,
        cantidad: 0,
        totalCentavos: 0,
        primeraVenta: sale.hora,
        ultimaVenta: sale.hora
      };
      row.cantidad += detail.cantidad;
      row.totalCentavos += detail.subtotalCentavos;
      row.primeraVenta = row.primeraVenta < sale.hora ? row.primeraVenta : sale.hora;
      row.ultimaVenta = row.ultimaVenta > sale.hora ? row.ultimaVenta : sale.hora;
      summary.set(key, row);
    }
  }

  const sortedRows = Array.from(summary.values()).sort((a, b) => {
    const categoryDiff = a.categoria.localeCompare(b.categoria);
    return categoryDiff || b.cantidad - a.cantidad || a.producto.localeCompare(b.producto);
  });

  const lines = [
    "MIGA POS - RESUMEN DE VENTAS",
    "============================",
    "",
    `Fecha: ${fecha}`,
    `Cantidad de produccion del dia: ${totalSandwichesProduced} sandwiches`,
    `Ventas registradas: ${sales.length}`,
    `Total venta pura: ${centsToMoney(totalVentaPuraCentavos)}`,
    `Total ToGood: ${centsToMoney(totalToGoodCentavos)}`,
    `Total BAJA: ${centsToMoney(totalBajaCentavos)}`,
    `Total general: ${centsToMoney(totalVentaPuraCentavos + totalToGoodCentavos + totalBajaCentavos)}`
  ];

  addTripleSpace(lines);
  lines.push(
    "VENTAS POR PRODUCTO",
    "-------------------"
  );

  if (sortedRows.length === 0) {
    lines.push("No hay ventas registradas para esta fecha.");
  }

  let currentCategory = "";
  for (const row of sortedRows) {
    if (row.categoria !== currentCategory) {
      currentCategory = row.categoria;
      addTripleSpace(lines);
      lines.push(currentCategory.toUpperCase());
    }
    lines.push(`- ${row.producto}`);
    lines.push(`  Cantidad vendida: ${row.cantidad}`);
    lines.push(`  Monto total: ${centsToMoney(row.totalCentavos)}`);
    lines.push(`  Primera venta: ${row.primeraVenta}`);
    lines.push(`  Ultima venta: ${row.ultimaVenta}`);
    lines.push("");
  }

  addTripleSpace(lines);
  lines.push("TOGOOD");
  lines.push("------");

  if (toGoodItems.length === 0) {
    lines.push("No hay salidas por ToGood para esta fecha.");
  } else {
    for (const { detail } of toGoodItems) {
      lines.push(`- ${cleanToGoodName(detail.productoNombre)} - ${centsToMoney(detail.precioUnitarioCentavos)}`);
    }
  }

  addTripleSpace(lines);
  lines.push("BAJA");
  lines.push("----");

  if (bajaItems.length === 0) {
    lines.push("No hay salidas por BAJA para esta fecha.");
  } else {
    for (const { detail } of bajaItems) {
      lines.push(`- ${cleanBajaName(detail.productoNombre)} - ${centsToMoney(detail.precioUnitarioCentavos)}`);
    }
  }

  addTripleSpace(lines);
  lines.push("AJUSTES DE STOCK DEL DIA");
  lines.push("------------------------");

  if (stockAdjustments.length === 0) {
    lines.push("No hay ajustes de stock para esta fecha.");
  } else {
    for (const movement of stockAdjustments) {
      const product = productsById.get(movement.productoId);
      const productName = product?.nombre || movement.productoId;
      const reason = movement.motivo || movement.referencia || "Sin motivo";
      lines.push(`- ${productName}`);
      lines.push(`  Cambio: ${movement.stockAnterior} -> ${movement.stockNuevo}`);
      lines.push(`  Motivo: ${reason}`);
      lines.push("");
    }
  }

  addTripleSpace(lines);
  lines.push("DETALLE DE VENTAS PURAS");
  lines.push("-----------------------");

  for (const sale of sales.slice().sort((a, b) => a.id - b.id)) {
    const pureDetails = sale.detalles.filter((detail) => !isToGoodDetail(detail) && !isBajaDetail(detail));
    if (pureDetails.length === 0) continue;

    const pureSaleTotal = pureDetails.reduce((total, detail) => total + detail.subtotalCentavos, 0);
    addTripleSpace(lines);
    lines.push(`Venta #${sale.id} - ${sale.hora} - ${centsToMoney(pureSaleTotal)}`);
    for (const detail of pureDetails) {
      lines.push(`  ${detail.cantidad} x ${detail.productoNombre} - ${centsToMoney(detail.subtotalCentavos)}`);
    }
  }

  const text = `\uFEFF${lines.join("\r\n")}\r\n`;
  downloadText(`miga-pos-resumen-${fecha}.txt`, text, "text/plain;charset=utf-8");
}

export async function exportFullBackup() {
  const payload = await exportAllData();
  const text = JSON.stringify(payload, null, 2);
  downloadText(`miga-pos-backup-${todayISO()}.json`, text, "application/json;charset=utf-8");
}

export async function importFullBackup(file) {
  if (!file) {
    throw new Error("Selecciona un archivo JSON de backup.");
  }

  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("El archivo no es un JSON valido.");
  }

  if (!window.confirm("Esto reemplaza los datos actuales de la tablet por el backup seleccionado. ¿Continuar?")) {
    return false;
  }

  await importAllData(payload);
  return true;
}

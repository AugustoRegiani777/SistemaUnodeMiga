export const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR"
});

export function centsToMoney(cents) {
  return money.format((Number(cents) || 0) / 100);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function currentTime() {
  return new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function stockStatus(product) {
  const stock = Number(product.stockActual) || 0;
  if (stock <= 0) return { label: "Sin stock", className: "out" };
  if (stock <= product.umbralBajo) return { label: "Stock bajo", className: "low" };
  return { label: "Disponible", className: "ok" };
}

export function downloadText(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

import { startApp } from "../../src/app/app.js";

function isLocalDevHost() {
  const { hostname } = window.location;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

async function disableServiceWorkerForLocalDev() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    if (isLocalDevHost()) {
      await disableServiceWorkerForLocalDev();
      return;
    }
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("No se pudo registrar el service worker.", error);
  }
}

registerServiceWorker();
startApp().catch((error) => {
  console.error(error);
  const message = document.querySelector("#app-message");
  if (message) {
    message.textContent = "No se pudo iniciar la app local. Revise que el navegador permita IndexedDB.";
    message.className = "flash-message error";
    message.hidden = false;
  }
});

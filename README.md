# Miga POS PWA

PWA offline-first para una tablet Android, pensada para caja rapida, produccion diaria, stock local, historial de ventas y backup manual. No usa backend, hosting, Flask, SQLite ni dependencias externas.

## Fase 1 - Analisis de referencia

La version Flask anterior se tomo como referencia visual y funcional, no como arquitectura tecnica. Se preservaron estas decisiones:

- Topbar sticky con marca `Miga POS`.
- Navegacion principal horizontal: `Caja`, `Produccion`, `Stock`, `Historial`.
- Fondo claro, tarjetas blancas, bordes suaves, tipografia del sistema.
- Azul oscuro como color principal y naranja/rojo como color de accion.
- Estados de stock con badges: `Disponible`, `Stock bajo`, `Sin stock`.
- Caja en dos zonas cuando el ancho lo permite: productos a la izquierda y carrito a la derecha.
- Botones tactiles de producto con nombre, precio y stock disponible.
- Produccion del dia con selector solo de sandwiches y stock manual separado para bolleria.
- Stock con buscador y filas simples.
- Historial con filtro por fecha y detalle de productos vendidos.

El alcance tecnico se redefine como una app estatica local:

- HTML, CSS y JavaScript vanilla.
- IndexedDB como persistencia principal.
- Service Worker para cachear el shell de la app.
- Manifest para instalacion como PWA.
- Exportacion local en TXT con resumen de ventas por producto.
- Backup completo en JSON para restaurar la tablet si hace falta.

## Arbol de archivos

```text
miga-pos-pwa/
  index.html
  manifest.json
  sw.js
  README.md
  assets/
    css/styles.css
    icons/icon.svg
    js/main.js
  src/
    app/app.js
    db/idb.js
    modules/backup.js
    modules/business.js
    modules/seed.js
    ui/render.js
    utils/format.js
```

## Modelo de datos IndexedDB

Base: `miga-pos-local`, version `1`.

Stores:

- `categorias`: `{ id, nombre, orden, creadoEn }`
- `productos`: `{ id, categoriaId, nombre, precioCentavos, stockActual, umbralBajo, controlaStock, orden, activo, creadoEn, actualizadoEn }`
- `produccion_diaria`: `{ id, productoId, fecha, cantidad, creadoEn, actualizadoEn }`
- `ventas`: `{ id, fecha, hora, totalCentavos, creadoEn }`
- `detalle_venta`: `{ id, ventaId, productoId, productoNombre, cantidad, precioUnitarioCentavos, subtotalCentavos, fecha, creadoEn }`
- `movimientos_stock`: `{ id, productoId, tipo, cantidad, stockAnterior, stockNuevo, referencia, fecha, creadoEn }`
- `configuracion`: flags internos, por ejemplo seed inicial.
- `cierres_diarios`: reservado para resumenes diarios simples.

Los precios se guardan en centavos de euro para evitar redondeos.

## Productos iniciales

Categorias:

- Sandwiches
- Bolleria
- Cafe
- Bebidas

Productos:

- Jamon y queso
- Pasta Oliva y queso
- Pimiento asado, gouda, philp
- Pesto, tomate y queso
- Berenjena y queso brie
- Jamon serrano y rucula
- Atun, palta y queso
- Salmon ahumado y phil
- Especial semanal
- Croissant
- Mini croissant
- Mini croissant ddl
- Pain au chocolat
- Expresso 30ml
- Cortado
- Latte
- Cafe con leche
- Capuccino
- Americano
- Flat white
- Cerveza
- Coca cola
- Sprite
- Nestea
- Aquiarios
- Jugo
- Agua

Para agregar productos, editar `src/modules/seed.js`. Al abrir la app, el catalogo base se sincroniza con IndexedDB sin borrar ventas ni movimientos existentes.

## Reglas implementadas

- La produccion diaria de sandwiches suma o resta sobre el stock actual de ese sabor.
- Ejemplo: con stock 0, cargar `34` deja 34; cargar `-12` deja 22; cargar `10` deja 32.
- No se permite que un ajuste negativo deje el stock por debajo de 0.
- Al guardar un sandwich, el selector avanza automaticamente al siguiente sabor.
- La bolleria se carga como stock manual: se escribe la cantidad total disponible de cada producto.
- En Caja hay un apartado separado `ToGoo` para registrar salidas por la aplicacion.
- `ToGoo` permite elegir un producto con stock, indicar cantidad, descontarlo y registrarlo diferenciado en historial.
- La salida `ToGoo` cobra el precio normal con 60% de descuento.
- En Caja hay un apartado separado `BAJA` para registrar consumo interno o merma.
- `BAJA` permite elegir un producto con stock, indicar cantidad, descontarlo y registrarlo diferenciado en historial con total `0,00 EUR`.
- Cafe y bebidas no llevan cantidad: se venden sin control interno de stock.
- Al vender, se valida stock y se descuenta automaticamente.
- Al agregar productos al carrito, el stock visible queda reservado y baja en pantalla; si se resta o se vacia el carrito antes de confirmar, vuelve al remanente anterior.
- Al llegar a 12 sandwiches, aplica automaticamente `Combo 12 sandwiches` a 38 EUR.
- Cada sandwich especial dentro de la docena suma 0,30 EUR adicionales.
- Los sandwiches agregados despues de completar la docena se suman como extras a precio normal.
- `Jamon serrano y rucula` cuenta como sandwich basico para la docena.
- No se permite stock negativo.
- Las cantidades deben ser enteros; valores como `1.5`, texto o vacios se rechazan con mensaje visible.
- Si stock es `0`, se muestra `Sin stock`.
- Si stock es menor o igual a `umbralBajo`, se muestra `Stock bajo`.
- Cada venta guarda fecha, hora, items, cantidades y total.
- Cada produccion, venta o ajuste manual genera un movimiento de stock.
- Los datos persisten al cerrar y reabrir la app.
- Backup local en TXT, con venta pura y ToGoo separados.

## Uso local para probar

La app necesita servirse por `http://localhost` para que el Service Worker funcione. Para probar sin agregar backend al proyecto, se puede usar cualquier servidor estatico temporal.

En desarrollo local por `localhost` o `127.0.0.1`, la app desactiva y limpia el Service Worker automaticamente para evitar que el navegador siga mostrando una version vieja desde cache.

Desde PowerShell, dentro de `miga-pos-pwa`:

```powershell
node .\tools\static-server.mjs 4173
```

Abrir:

```text
http://127.0.0.1:4173/
```

Tambien se puede copiar la carpeta completa a un servidor estatico local o abrirla desde una app Android que sirva archivos locales por localhost.

## Instalacion en Android

Opcion recomendada para uso real:

1. Copiar la carpeta `miga-pos-pwa` a la tablet o a una PC de configuracion.
2. Servirla una vez por `http://localhost` o por la red local para instalarla.
3. Abrir la URL en Chrome Android.
4. Usar el menu de Chrome y elegir `Agregar a pantalla principal` o `Instalar app`.
5. Abrir `Miga POS` desde el icono instalado.
6. Probar modo avion: la app debe abrir y operar porque el shell queda cacheado y los datos viven en IndexedDB.

Nota operativa: una PWA se instala desde un origen web. Una vez instalada y cacheada, opera sin internet. Si la tablet se usa sola, conviene preparar la instalacion antes del dia de venta.

## Backup local en TXT

En `Historial`:

- `Exportar resumen TXT`: descarga un `.txt` legible.
- `Exportar backup JSON`: descarga una copia completa de IndexedDB.
- `Importar backup JSON`: restaura una copia completa, con confirmacion previa porque reemplaza los datos actuales.
- El resumen incluye fecha, cantidad de ventas registradas, total de venta pura, total ToGood, total general, productos vendidos en caja normal, apartado ToGood separado y detalle solo de ventas puras.

Recomendacion: exportar el resumen al cierre del dia y guardarlo fuera de la tablet.
Recomendacion adicional: exportar el backup JSON despues del cierre si se quiere poder restaurar la tablet completa.

## Revision final

Primera version funcional:

- Caja tactil con buscador, categorias, carrito, total y confirmacion.
- Produccion diaria para sandwiches, con avance automatico al siguiente sabor.
- Stock manual separado para bolleria.
- Apartado `ToGoo` en Caja para registrar salidas con 60% de descuento y descuento de stock.
- Cafe y bebidas vendibles sin cantidad ni descuento de stock.
- Stock actual con estados visuales.
- Historial por fecha.
- Persistencia local IndexedDB.
- PWA con manifest y service worker.
- Exportacion TXT con venta pura y ToGoo separados para no mezclar los totales.
- Exportacion TXT con venta pura, ToGoo y BAJA separados para no mezclar los totales.
- Exportacion/importacion JSON completa para restauracion operativa.
- Validaciones contra decimales, cantidades invalidas y doble confirmacion accidental.

Fuera de alcance intencional:

- Autenticacion.
- Facturacion o fiscalidad.
- Pagos.
- Hosting.
- Sincronizacion multi-dispositivo.
- Backend o base SQL.

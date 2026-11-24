# Rendimiento de KR POS

## Qué se cambió y por qué

1. **jspdf + autotable fuera de los bundles de pantalla.** Las funciones puras de etiquetas (`controlNumberLabel`, `itemDescription`, `resolvePaymentLines`, etc.) viven ahora en `lib/delivery-note-labels.ts` y `quoteControlNumberLabel` en `lib/quote-labels.ts`; los módulos originales las re-exportan. Los componentes cliente (POS, reportes, cotizaciones, nómina, asistente, lista de precios, cierre de caja) importan los generadores de PDF con `import()` solo al pulsar el botón. Antes, abrir el POS descargaba ~400 KB de jspdf.
2. **`useLiveRefresh` agrupa eventos.** Una venta emite `product` y `sale`; antes cada uno hacía `router.refresh()` (2 recargas del servidor por venta y por pestaña). Ahora se unen en un solo refresh por ventana de 400 ms (`lib/coalesce.ts`).
3. **Sincronización sin internet.** `syncPendingSales` ejecuta una sola pasada a la vez (evento `online`, botón y reintentos comparten la misma). `OfflineSyncBanner` reintenta con espera creciente (`lib/offline/backoff.ts`: 2 s, 4 s ... tope 60 s) mientras queden ventas y haya red, y al volver a la pestaña. La idempotencia por `idempotencyKey` sigue intacta.
4. exceljs ya se carga dinámico (`lib/spreadsheet.ts`); recharts no se usa.

## Cómo medir

- `npx next build` y comparar el tamaño First Load JS de `/pos`, `/reports`, `/quotes` antes/después.
- Pestaña Red del navegador: al vender, debe verse un solo refresh RSC por pestaña.
- Offline: poner la red en "Offline", vender, volver a "Online": la cola se vacía en segundos; con el servidor caído, reintenta cada 2/4/8... s.
- Pruebas: `tests/perf-pure.test.ts`.

## Pendiente (requiere migración o infraestructura)

- Revisar con `EXPLAIN` índices en `Sale(companyId, createdAt)` y `SaleItem(saleId)` si los reportes superan 200 ms (no se creó ninguno).
- Redis/`getOrSetCache` para catálogo y reportes calientes en el VPS; pooler de conexiones (pgbouncer) frente a Postgres.
- CDN/caché en el proxy para `/_next/static` e imágenes de producto.
- Auditoría de consultas Prisma en serie por pantalla (no se tocaron en esta pasada para no arriesgar RLS).
- `public/sw.js` no se cambió (CACHE_VERSION v5): la estrategia actual ya cachea el shell `/pos/offline` y sus chunks.

## Fluidez en el teléfono (bloqueo al deslizar)

Causas probables corregidas (sin dispositivo no se pudo reproducir):

1. **Un websocket y un `router.refresh()` por cada `useLiveRefresh`.** PosClient abría 2 clientes Realtime, ProductTable 2 y el aviso de pagos 1; cada uno refrescaba por su cuenta y al volver de segundo plano reconectaban en cascada. Ahora `lib/useLiveRefresh.ts` usa un cliente compartido, un canal por nombre y un refresco por router vía `lib/refresh-gate.ts` (agrupa 400 ms, hueco mínimo 1,5 s, en pausa si la app está oculta y un solo refresco al volver).
2. **Cuadrícula del POS sin límite.** `ProductPicker` pintaba todo el catálogo en cada tecla. Ahora 90 por página + "Mostrar más", `useDeferredValue` en la búsqueda y `content-visibility: auto` por tarjeta.
3. **`backdrop-filter` en barra fija sobre la lista** (`.glass-bar`, barra del carrito): en pantallas táctiles ahora es fondo sólido; se quitó la transición de `backdrop-filter` del velo de sedes.
4. **Service worker:** las navegaciones no tenían límite de espera; con señal colgada quedaba en blanco. Ahora 25 s y cae al shell offline (rutas POS) o al error del navegador. `CACHE_VERSION` v6 (limpia cachés previos).
5. **OfflineSyncBanner** reemplazaba su estado cada 5 s sin cambios (re-render continuo); ahora solo si cambia.
6. `loading.tsx` (esqueleto) en pos, inventory, reports, purchases, customers, quotes, suppliers, accounting, payroll, employees.

Verificar en dispositivo: Web Inspector/Chrome remoto con perfil Performance al deslizar el POS con más de 300 productos; en Red, una venta = un refresh RSC y un solo websocket realtime; app en segundo plano 2 min y volver = un refresh. Pruebas: `tests/refresh-gate.test.ts`.

No verificado: que el bloqueo reportado desaparezca; no se paginaron las listas de inventario/ventas/compras; capacitor.config.ts sin cambios.

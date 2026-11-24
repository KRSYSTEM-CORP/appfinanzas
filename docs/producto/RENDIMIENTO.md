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

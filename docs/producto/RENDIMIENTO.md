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

## Cierre de rendimiento y móvil (2026-11-24)

Medido con el build de producción (`npm run build` + `next start -p 3012`), chromium 390x844 táctil, CPU 4x (CDP), la base de pruebas por túnel SSH (unos 170 ms por consulta, ver nota) y 39 rutas del gerente. Para ver las consultas de cada pantalla, el servidor acepta `KR_QUERY_LOG=1` (imprime cada consulta Prisma con su duración).

| Métrica (las 39 rutas) | Antes | Después |
| --- | --- | --- |
| Primer contenido (FCP) | 10,5 a 12 s en todas | 2,0 a 3,2 s (mediana de carga 3,3 s) |
| Peticiones por pantalla | 26 a 58 | 25 a 29 (mediana 26) |
| Tarea larga máxima | 446 ms (`/accounting/statements`) | 256 ms; ninguna ruta pasa de 1 s |
| Desbordamiento horizontal a 390 px | `/inventory/update` 18 px | 0 en las 39 rutas |
| `/customers/receivables` | 2 cargas completas, 34 a 74 peticiones | redirección 307 desde la configuración, 1 carga |
| `/finance`, tarea larga | 354 ms (1 160 ms en otra pasada), 5,6 s acumulados | 222 ms, 0,9 s acumulados |

Causas encontradas y corregidas:

1. **Caché sin Redis esperaba unos 10 s por llamada.** `lib/cache.ts` creaba el cliente de Upstash con `fromEnv`; sin credenciales el SDK reintentaba contra una URL vacía unos 10 s por cada `getOrSetCache` (branding, tasa, sedes, productos), así que cada pantalla tardaba 11 s o 21 s. Ahora, sin `UPSTASH_REDIS_REST_URL/TOKEN` se salta la caché, y con credenciales hay un solo reintento de 100 ms. Es la causa de casi todo el «FCP de 10 s».
2. **Saldos de cuentas en bucle.** `getAccountBalances` y `listSourceAccounts` hacían 6 consultas por cuenta, en serie dentro de la transacción (Cuentas bancarias, Estados financieros, selector de cuenta en compras, nómina y gastos). Ahora `accountBalances()` calcula todas con 6 consultas en total y reparte por cuenta en JS con el mismo criterio (`balanceSince`, método vinculado).
3. **Prefetch de enlaces.** Cada `Link` a una ruta dinámica lanzaba una petición RSC que en el servidor ejecuta el layout completo (unas 20 consultas); una pantalla llegaba a lanzar 20 o 30. Todos los enlaces usan ahora `components/ui/nav-link.tsx` (prefetch apagado por defecto; se puede reactivar con `prefetch` en uno concreto).
4. **Listas sin límite.** `/documents` pedía 500 ventas y 500 presupuestos, y `/reports` 500 ventas con partidas y pagos; ahora cargan 150 y 100, con «Cargar documentos anteriores» y «Cargar ventas anteriores» (`?n=`, tope 2 000 y 1 000). `MasterDetail` (inventario, gastos, libros, empleados) usa `content-visibility: auto` en cada fila.
5. **Cifras animadas.** `CountUp` (Finanzas) hacía `setState` por fotograma en decenas de cifras a la vez; ahora escribe el texto directo en el DOM.
6. **Volcado del catálogo al abrir el POS.** `useCatalogSync` clonaba el catálogo a IndexedDB durante la hidratación; ahora espera a que el navegador esté libre (`requestIdleCallback`, tope 4 s).
7. **Sentry sin internet.** `instrumentation-client.ts` no inicia Sentry si el navegador está sin conexión y quita el ping de sesión por cada carga de página.
8. **Redirección de ruta fija.** `/customers/receivables` redirige desde `next.config.ts`; antes `redirect()` dentro de la página respondía 200 con el esqueleto y recargaba el destino.

Móvil y sin conexión:

- `/inventory/update`: cabecera, botones de acción y barra de confirmación con `flex-wrap`; el botón «Subir archivo actualizado» empujaba la página a 408 px y ensanchaba también la barra fija inferior.
- Deslizar rápido con toque emulado (8 gestos hacia abajo y 4 hacia arriba, CPU 4x) en `/pos`, `/inventory`, `/reports`, `/documents`, `/tax-book` y `/accounting/gastos`: ningún fotograma pasó de 100 ms salvo uno de 117 ms en gastos, y sin tareas largas relevantes. La base de pruebas tiene pocos datos; listas de 300 o más productos siguen pendientes de revisar en un dispositivo real.
- Logos de Zelle, Binance, PayPal y bancos: el service worker (`CACHE_VERSION` v8) los precarga y los sirve cache-first (también `/brand` e `/icons`). Verificado: con la red cortada, `/banks/zelle.png`, `binance.png` y `paypal.png` responden 200 desde el caché.
- Comprobante «N.º pendiente»: al sincronizar una venta en cola, `syncPendingSales` emite `kr:sale-synced` con la clave local y el id real; `PosClient` y `PosOfflineClient` cargan la venta (`getSaleReceipt`) y el comprobante pasa al número de control real sin recargar. Verificado por tipos y lectura; no se probó con una venta real en cola para no crear ventas en la base compartida.

Nota sobre los tiempos: el túnel SSH a la base de pruebas cuesta unos 170 ms por consulta y cada pantalla ejecuta de 22 a 140 consultas (el layout solo son 22, repartidas en varias transacciones de 3 viajes cada una). Con la base en el mismo servidor (VPS) ese costo es casi nulo, así que el FCP de 2 a 3 s medido aquí es sobre todo latencia de red hacia la base de pruebas, no del código. Las cifras firmes son peticiones, tareas largas, desbordamiento y número de consultas.

Consultas por pantalla (segunda pasada, `KR_QUERY_LOG=1`):

`lib/tenant-db.ts` ahora tiene `withTenantScope(companyId, fn)`: dentro, todas las llamadas a `withTenant` de la misma empresa reutilizan UNA transacción (se ahorran BEGIN, `set_config` y COMMIT de cada una; otra empresa abre la suya, así RLS no se relaja) y `scopeMemo(clave, fn)` ejecuta una sola vez una lectura idéntica (días cerrados de caja, tasa, datos fiscales, IVA). Se aplicó a `/finance`, `/accounting/statements`, `/accounting/accounts`, `/settings` y `/home`. `KR_NO_TENANT_SCOPE=1` apaga el reuso para comparar.

| Pantalla | Consultas antes | Después |
| --- | --- | --- |
| `/finance` | 139 | 55 |
| `/accounting/statements` | 96 | 66 |
| `/accounting/accounts` | 77 | 70 |
| `/settings` | 75 | 49 |
| `/home` | 81 | 41 |

Equivalencia: con la sesión de gerente se descargó el texto de las 5 pantallas con y sin el reuso (`KR_NO_TENANT_SCOPE=1`) y es idéntico carácter por carácter (en `/finance` solo cambió «día 24 de 30» por el cambio de fecha entre dos corridas; repetido el mismo día, idéntico). Prueba unitaria `tests/unit/tenant-scope.test.ts` (una transacción por empresa, otra empresa abre la suya, memo solo dentro del scope).

Pendiente, con su causa:

- No se llegó a menos de 30 consultas. De las que quedan, 7 a 10 pares BEGIN/COMMIT son del layout raíz (sesión, sedes, avisos, tasa del menú) y de guardas que corren fuera del scope; el resto son lecturas distintas de verdad. En `/accounting/accounts` y `/accounting/statements` queda un bucle por cuenta en `accountMovementsList` (compras, nómina, gastos y salidas por cada cuenta): agruparlo como se hizo con los saldos exige reescribir esa función, y con pocas cuentas (la empresa de pruebas) pesa poco.
- Dentro del scope, una consulta que falle aborta la transacción de la pantalla completa (antes solo esa lectura; hay `.catch` en `/home` y `/accounting/statements`).

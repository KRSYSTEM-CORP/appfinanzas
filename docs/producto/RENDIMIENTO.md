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

Tercera pasada: sin riesgo de transacción abortada, movimientos por lote y layout en una transacción.

- Todo `.catch`/`try` que envuelve una lectura dentro de un scope usa `outsideScope()` (su propia transacción): `getAccountBalances` en Estados, `netSalesCents` en Inicio, avisos y estado de pago del layout, y la escritura de la tasa BCV en `computeExchangeRateInfo`. Los demás `try` de `lib/actions` son de acciones de escritura, que no corren dentro de un scope. Prueba: `tests/unit/tenant-scope.test.ts` («outsideScope abre su propia transacción…»).
- `accountMovementsMany()` (lib/account-movements.ts) trae los movimientos de todas las cuentas con 6 consultas y los reparte por cuenta con el mismo constructor (`buildMovements`) que `accountMovementsList`; lo usan `getAccountsPeriodReport` y `getAccountsPeriodMovements`.
- El layout raíz lee branding, sedes, tasa del menú, avisos y estado de pago dentro de un scope (una transacción en vez de 4 a 5).
- Cifras: texto de las 5 pantallas idéntico con y sin `KR_NO_TENANT_SCOPE=1`.

| Pantalla | Original | Con scope y lote |
| --- | --- | --- |
| `/finance` | 139 | 51 |
| `/accounting/statements` | 96 | 64 |
| `/accounting/accounts` | 77 | 48 |
| `/settings` | 75 | 45 |
| `/home` | 81 | 41 |


## Cuarta pasada: consultas agrupadas (2026-11-25)

Cómo se midió: `KR_QUERY_LOG=1` (con `KR_QUERY_LOG_LEN=330` para ver la consulta completa), una petición HTTP por ruta con la sesión de gerente, sin service worker ni prefetch, contando cada línea `[Q]` (incluye `set_config` y `COMMIT`). «Antes» es `main` (e530852e) medido el mismo día y contra la misma base; el texto completo de cada pantalla se comparó antes/después (idéntico en las 37 rutas; `/customers` mostró un cliente más porque se creó uno entre las dos mediciones).

Qué se cambió:

1. **`lib/batch-sql.ts`**: `bq<Fila>(tx)\`SELECT ...\``. Las consultas SQL pedidas en el mismo turno sobre la misma transacción viajan en UNA sentencia (`SELECT (SELECT json_agg(t) FROM (consulta 0) t) AS r0, ...`). Cada subconsulta es la original con los mismos filtros y el mismo RLS. Una pantalla pasa de ~30 agregados en serie a 2 o 3 viajes. Las filas vuelven como JSON (`jsDate`/`jsDateOnly` devuelven las fechas).
2. Se convirtieron a SQL agrupado los agregados de `reports.ts`, `finance.ts`, `seller-reports.ts`, `home.ts`, `statements.ts` (IVA, inventario, por pagar, consumo interno y movimientos en sumas SQL), `account-balance.ts`, `account-movements.ts`, `account-queries.ts` (cuentas, una lectura por pantalla), `closed-days.ts`, `cash-closing.ts` (resumen del turno: 12 consultas a 2), `branches.ts`, `transfers.ts`, `plan.ts` y los getters de `settings.ts`.
3. **Sesión en una consulta** (`lib/session.ts`): usuario, empresa, rol y sede en un solo `SELECT` dentro de una transacción (antes 2 lecturas más hasta 3 transacciones).
4. **`withTenantScope` perezoso**: la transacción se abre al primer `withTenant` y se cierra con COMMIT, o con ROLLBACK si la pantalla falla; una pantalla que no lee nada no abre ninguna. Estado de pago del layout en una sola consulta.
5. Pantallas envueltas en `withTenantScope`: POS, Reportes, Compras, Gastos, Resumen, Libros de impuestos, Sucursales, Suscripción (las lecturas con `.catch` van por `outsideScope`).
6. Índices (migración `20261128110000_indices_consultas_pantallas`, aditiva): `SalePayment(createdAt)` y `Purchase(companyId, paymentStatus)`. Comprobado con `EXPLAIN ANALYZE` (`enable_seqscan=off`): los cobros por fecha y las compras por pagar los usan; los de ventas, gastos y cierres (`companyId` + fecha) ya existían.

Consultas por pantalla (antes → después):

| Pantalla | Antes | Después |
| --- | --- | --- |
| `/finance` | 63 | 15 |
| `/accounting/statements` | 59 | 19 |
| `/accounting/accounts` | 44 | 20 |
| `/settings` | 39 | 20 |
| `/home` | 44 | 16 |
| `/pos` | 47 | 20 |
| `/reports` | 46 | 16 |
| `/branches` | 59 | 12 |
| `/accounting/gastos` | 63 | 27 |
| `/purchases` | 40 | 24 |
| `/tax-book` | 36 | 20 |
| `/inventory/transfers` | 43 | 22 |
| `/billing` | 43 | 18 |
| `/accounting` | 40 | 14 |

Las demás rutas de las 37 medidas quedan entre 7 y 24 (el layout con sesión solo cuesta 7). Pruebas: `tests/unit/batch-sql.test.ts`, `tests/unit/tenant-scope.test.ts` y `tests/integration/scope-equivalence.test.ts` (misma cifra con scope, sin scope y en serie, y contra el cálculo original con el ORM).

Pendiente: seguir bajando de 30 exige unificar lecturas distintas en consultas agrupadas (por ejemplo los agregados de `lib/actions/finance.ts` en un solo SQL); no se hizo.

## Medición en el servidor propio (2026-11-25)

Instancia de prueba aislada en el VPS: imagen `kr-pos:latest` (la de producción) en el contenedor `kr-app-medicion`, ligada a `127.0.0.1:3100` (sin salida a internet), con la base `kr_test` del contenedor `kr-test-pg` (rol `app_runtime`, RLS real, latencia a la base de ~1 ms) y sin claves de correo, pagos, Redis, Sentry, IA ni R2. Se accedió desde la Mac por túnel SSH; chromium propio (playwright) con sesión del gerente, 42 rutas, 2 cargas por ruta (se toma la segunda), móvil 390x844 táctil y escritorio 1440x900, con y sin CPU 4x. El túnel agrega ~90 ms de ida y vuelta a cada petición. La instancia y su env se borraron al terminar.

| Perfil | TTFB mediana / máx. | FCP mediana / máx. | Interactivo (aprox.) mediana / máx. | Tarea larga máx. | Peticiones |
| --- | --- | --- | --- | --- | --- |
| Móvil, sin throttle | 143 ms / 343 ms | 368 ms / 588 ms | 368 ms / 923 ms | 67 ms | 25 a 32 |
| Móvil, CPU 4x | 162 ms / 808 ms | 780 ms / 1 424 ms | 1 606 ms / 2 529 ms | 344 ms (`/reports`) | 25 a 32 |
| Escritorio, sin throttle | 140 ms / 311 ms | 384 ms / 800 ms | 392 ms / 993 ms | 267 ms | 25 a 32 |
| Escritorio, CPU 4x | 200 ms / 944 ms | 796 ms / 1 584 ms | 1 794 ms / 3 286 ms | 533 ms (`/settings`) | 25 a 32 |

(«Interactivo» = fin de la última tarea larga tras el primer contenido.)

Contra la medición por túnel a la base (FCP de 2,0 a 3,2 s): en el VPS ninguna ruta pasa de 1,6 s de primer contenido, ni siquiera con CPU 4x; sin throttle todas están bajo 1 s. Ninguna ruta tiene tarea larga de 1 s (el máximo es 533 ms, hidratación con CPU 4x). Desbordamiento horizontal: 0 en todas.

Rutas > 2 s de interactivo solo con CPU 4x (hidratación en CPU lenta, no servidor): móvil `/home`, `/quotes`, `/reports`, `/documents`, `/tax-book`, `/finance`, `/settings`; escritorio además `/pos`, `/inventory`, `/customers`, `/branches`, `/assistant`, `/inventory/import`, `/pos/offline`. Sin throttle, ninguna.

Tiempo de servidor puro (curl dentro del VPS, 3 corridas, primer byte): 25 a 100 ms en casi todas; `/reports` ~70 ms, `/accounting/statements` ~70 ms, `/home` ~100 ms, `/finance` ~200 ms (la más pesada; la reduce otro frente, no se tocó aquí). Ninguna causa de lentitud que corregir en el código.

Límites: la base de pruebas tiene pocos datos (222 ventas); con una empresa grande, `/reports`, `/finance` y `/tax-book` serán las primeras en crecer. Realtime (Supabase) y Sentry se bloquearon en el navegador de medición para no tocar servicios reales. Algunas cargas de la segunda pasada no llegaron a «red inactiva» en 20 s (artefacto de los websockets bloqueados).

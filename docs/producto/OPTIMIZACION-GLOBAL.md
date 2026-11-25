# Optimizacion global (2026-11-25)

## 1. Bundle (JS inicial por ruta, gzip, `npm run build`)

| Ruta | Antes | Despues |
| --- | --- | --- |
| /pos | 345 KB | 163 KB |
| /pos/offline | 323 KB | 140 KB |
| /quotes | 313 KB | 130 KB |
| /inventory | 207 KB | 146 KB |
| /home | 168 KB | 107 KB |
| /login | 170 KB | 109 KB |
| /finance | 184 KB | 124 KB |
| /settings | 241 KB | 181 KB |

Causas: `@zxing` (~480 KB sin comprimir) se importaba estatico desde el POS y el formulario de producto; ahora se carga al abrir la camara. `@supabase/supabase-js` (~200 KB) estaba en el JS de todas las rutas por `useLiveRefresh`; ahora se descarga tras pintar. Se quito `recharts` (sin uso). Medicion: `client-reference-manifest` de cada ruta, sumando sus chunks.

## 2. Cache y red

- Caddyfile (`infra/contabo/app/`): Cache-Control inmutable para `/_next/static`, 7 dias + stale-while-revalidate para `/banks`, `/brand`, `/icons`. `sw.js` y las paginas no se tocan. Ya tenia zstd/gzip.
- docker-compose: se publica `443/udp` para HTTP/3 (abrir UDP 443 en el cortafuegos).
- Service worker v9: tope de 400 fotos de producto en cache.
- Para aplicar en el VPS: copiar Caddyfile y docker-compose a /opt/kr/ y `docker compose up -d caddy`.

## 3. Base de datos

Base de pruebas con empresa temporal (50 000 ventas, 200 000 lineas, 50 000 pagos, 100 000 movimientos; ya borrada). Casi todas las consultas ya usaban indice. Dos hacian Seq Scan en `Sale`:

| Consulta | Antes | Despues |
| --- | --- | --- |
| Historial de ventas de un cliente | 5,8 ms | 0,2 ms |
| Total a credito (cuentas por cobrar) | 8,2 ms | 3,1 ms |

Migracion `20261128100000_indices_ventas_cliente_y_credito` (`Sale(companyId, customerId)`, `Sale(companyId, paymentStatus)`), aditiva; ~6 MB por cada 50 000 ventas. Aplicada y marcada en la base de pruebas; NO en produccion.

## 4. POS y listas con 5 000 productos

Medido con chromium propio, CPU 4x, build de produccion, 5 016 productos en la sede (generados en la empresa de pruebas y borrados al terminar; la sesion de prueba solo entra a esa empresa, no se pudo usar una empresa aparte).

Hallazgo importante: el POS, Presupuestos y Compras solo cargaban 500 productos (`PRODUCT_LIST_LIMIT`), asi que con mas de 500 el resto no se podia vender ni buscar. El tope sube a 5 000 (documento de la pagina del POS: 88 KB con 500, 456 KB con 5 000, antes de comprimir).

| Medida (4x CPU, 5 016 productos) | Antes | Despues |
| --- | --- | --- |
| Abrir /pos: tareas largas (suma / mayor) | 2 103 ms / 430 ms | 600 ms / 190 ms |
| Buscar escribiendo 12 teclas (suma / mayor) | 480 ms / 148 ms | 50 a 180 ms / 68 ms |
| /inventory: nodos del DOM | 163 028 | 5 575 |
| /inventory: tareas largas (suma / mayor) | 14 177 ms / 10 366 ms | 1 534 ms / 442 ms |

Cambios: tarjeta de producto memoizada y texto de busqueda en minusculas calculado una sola vez; `productById` del POS con `useMemo` (se reconstruia con 5 000 entradas en cada cambio del carrito); `MasterDetail` y la tabla de escritorio de inventario pintan 80 filas y agregan 80 mas al llegar al final; el volcado a IndexedDB se omite si la firma del catalogo no cambio en 6 horas. Clientes ya paginan en servidor, Reportes y Documentos con `?n=`. La busqueda ya usaba `useDeferredValue` (no hace falta un debounce aparte). El escaneo por Enter sobre 5 000 productos no produjo tareas largas.

## 5. Base de datos: N+1, pool y timeouts

- `completeSale`: una actualizacion de existencias por producto distinto (con `WHERE stock >= cantidad`, atomica), todas dentro de una sola transaccion; no hay consultas por linea de lectura. No se cambio.
- Transacciones de `withTenant`: `maxWait` 10 s y `timeout` 20 s, correcto.
- Pool (`lib/prisma.ts`): ahora `max` 10 (`PG_POOL_MAX`), espera de conexion 10 s, conexiones ociosas 30 s y `statement_timeout` 60 s (`PG_STATEMENT_TIMEOUT_MS`). Antes un pool agotado esperaba sin limite. Postgres del VPS permite 80 conexiones.

## 6. Robustez

- `/api/health` ya comprueba la BD (`SELECT 1`).
- CSP sigue en modo solo reporte y ahora lleva `report-uri /api/csp-report`: una linea por aviso (`[csp] regla bloqueo origen en ruta`), sin parametros, IP ni agente de usuario, con tope de 60 lineas por minuto y cuerpo de 8 KB. Para verlos: `docker compose logs app | grep '\[csp\]'`.
- Limites de intentos: los 3 PDF publicos (`/api/public/sales|quotes|pagos`) contaban por el PRIMER valor de `x-forwarded-for`, que controla el cliente (se saltaba el limite cambiando la cabecera). Ahora usan `pickClientIp`, y Caddy fija `X-Real-IP` con la IP real (`header_up X-Real-IP {remote_host}`).
- Registros: `lib/email.ts` imprimia el correo completo y el HTML (con enlaces de restablecimiento) cuando no hay llave de Resend, y el correo completo al fallar un envio; ahora solo `m***@dominio` (`maskEmail`, con prueba).
- Crons: los tres exigen `CRON_SECRET`; con el timeout de 60 s de las consultas ya no pueden colgarse indefinidamente.

## 7. PWA y Capacitor

- Capacitor apunta a la URL de produccion (`webDir: public`): la app nativa pesa solo el WebView; el JS del POS bajo de 345 a 163 KB gzip, lo que baja el arranque en frio.
- Manifest: se agregan `id`, `scope`, `lang: es`, `orientation`, `categories` y un acceso directo «Abrir el POS». Iconos ya son pequeños (192 px: 9,8 KB; 512 px: 35 KB).
- Service worker v9 con tope de fotos (ver arriba).

## 8. Verificacion en navegador de las cargas diferidas

Con `getUserMedia` falso (video de canvas) y un WebSocket falso para Realtime, sobre el build de produccion:
- Realtime: el socket se abre despues de pintar, une el canal `pos:<empresa>` y un aviso `sale` dispara `router.refresh()`.
- Escaner: al pulsar «Escanear» se descargan los chunks de zxing, se llama a `getUserMedia` una vez y aparece el video sin error.

## No hecho / limites

- Virtualizacion con ventana deslizante (react-window) no se uso: el crecimiento por lotes con `content-visibility` basta con los volumenes medidos y no agrega dependencias. Con mas de 5 000 productos por sede haria falta busqueda en servidor.
- Una empresa de prueba separada no era viable para el navegador (la sesion guardada es de la empresa de pruebas); los 5 000 productos se borraron al terminar.
- No se probo en un telefono real.

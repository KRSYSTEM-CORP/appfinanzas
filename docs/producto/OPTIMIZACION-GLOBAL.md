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

## 5. Robustez

`/api/health` ya comprueba la BD (`SELECT 1`); CSP ya esta en modo report-only.

## No hecho

Medicion de long tasks del POS con 5 000 productos, virtualizacion de listas, `use cache`, reporte de CSP y revision de rate limits/logs quedaron sin tocar.

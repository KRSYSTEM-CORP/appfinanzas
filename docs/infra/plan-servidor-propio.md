# Plan: servidor propio con Postgres propio

Decisión del dueño: salir de los límites de Neon y alojar la app y la base de datos en un
servidor propio, barato, funcional y duradero. Los precios son de las páginas oficiales
(consultadas en noviembre de 2026) y deben reconfirmarse antes de contratar.

## Arquitectura recomendada

```
Cloudflare (DNS, protección, certificados)  ── gratis
        │
   Servidor APP  ── Next.js en Docker + Caddy (HTTPS)
        │  red privada
   Servidor BD   ── PostgreSQL 17 (solo accesible desde el servidor APP)
        │
   Respaldos ──► R2 (principal) + B2 (segunda copia), cifrados
```

La app y la base van **en servidores separados** y comunicados por red privada: así un fallo o un
despliegue de la app no toca los datos, y la base nunca queda expuesta a internet.

## Costos mensuales (estimados)

| Pieza | Etapa 1 (hasta ~50 empresas) | Etapa 2 (~100) | Etapa 3 (~200) |
|---|---|---|---|
| Servidor APP | Hetzner CX23 ≈ €5,49 | CX33 ≈ €8,49 | 2 × CX43 ≈ €32 + balanceador |
| Servidor BD | CX33 ≈ €8,49 | CX43 ≈ €15,99 | CX43 + réplica ≈ €32 |
| Copias de servidor (Hetzner) | ~20 % (≈ €3) | ≈ €5 | ≈ €13 |
| R2 + B2 (respaldos) | ≈ $0–1 | ≈ $1–2 | ≈ $2–5 |
| Cloudflare (DNS y protección) | $0 | $0 | $0 |
| **Total aproximado** | **≈ €18–20** | **≈ €30–35** | **≈ €80–95** |

(Namecheap Quasar, $12,88–$15,88 al mes, es una alternativa de un solo servidor, pero con menos
opciones de crecimiento y de respaldo.)

## Capas de respaldo
1. `pg_dump` cifrado cada 4–6 h a R2 y B2 (este repositorio: `respaldo-bd.yml`).
2. Archivado continuo (WAL) a R2 para recuperar a un punto exacto (solo con la base propia).
3. Copias completas del servidor por el proveedor.
4. Prueba de restauración mensual y aviso si un respaldo deja de llegar.

## Qué hay que hacer para pasar de Neon + Vercel a esto
1. Contratar los servidores y abrir Cloudflare (R2) y Backblaze (B2). Lo hace el dueño.
2. Preparar: imagen Docker de la app, Caddy, Postgres con RLS y rol `app_runtime`, ruta de salud
   (`/api/health`), tareas programadas (reemplazan los 2 cron de Vercel), despliegue desde GitHub.
3. Endurecer el servidor: llaves SSH, firewall, actualizaciones automáticas, bloqueo de intentos.
4. Ensayo completo en un servidor de pruebas con una copia de los datos.
5. Corte: mantenimiento breve, restaurar la base en el servidor nuevo, cambiar el dominio.
   Neon y Vercel se conservan una o dos semanas como vuelta atrás.

## Importante: la base y la app se mudan juntas
La base de datos propia no se expone a internet. Vercel no tiene IP fija, así que no se puede
dejar la app en Vercel y la base en el servidor sin abrir la base a todo internet. Por eso la
mudanza de la base y la de la app van en el mismo corte.

## Antes de las empresas nuevas
El plan Hobby de Vercel se agota alrededor de 7–14 empresas y no permite uso comercial. Mientras
se prepara el servidor, usar Vercel Pro como puente (o su prueba gratis de 14 días).

# Servidor propio (Contabo): configuración real en producción

Copia de lo que corre en el VPS (un solo servidor: app + Postgres 18 + Caddy + adminapi). **Sin secretos**: los secretos viven en el servidor (`/opt/kr/app.env`, `/opt/kr-db/db.env`, `/opt/kr/admin-api/.env`, `/etc/kr/*`, permiso 600).

| Carpeta | Va en el servidor en |
|---|---|
| `bin/kr-backup`, `kr-vigia`, `kr-notify`, `kr-grants`, `kr-cron.sh`, `kr-set-mail`, `kr-set-r2b2` | `/usr/local/bin/` (755) |
| `cron/kr-ops`, `cron/kr-pos` | `/etc/cron.d/` (644) |
| `app/docker-compose.yml`, `Caddyfile`, `b.sh` | `/opt/kr/` |
| `db/*` | `/opt/kr-db/` (más `grants.sql` e `init/` de `infra/db/`) |
| `adminapi/*` | `/opt/kr/admin-api/` |
| `ssh/00-kr.conf` | `/etc/ssh/sshd_config.d/` (debe cargarse antes que `50-cloud-init.conf`) |
| `bin/kr-deploy.sh` | se ejecuta desde el Mac del dueño |

Imagen de la app: se construye en el servidor desde `main` (`b.sh`) con `NEXT_PUBLIC_*` leídas de `app.env`. Alertas: `kr-notify` (Resend por SMTP). Respaldos cifrados con `age` a R2 y B2. Procedimiento completo, restauración y reversa: manual de operación del dueño (`00 ADMINISTRACION/MANUAL-OPERACION-KR-SYSTEM.md`, fuera del repositorio).

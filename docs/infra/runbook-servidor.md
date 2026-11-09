# Manual del servidor propio (app + Postgres)

> **Estado:** estos archivos están escritos y revisados, pero **la imagen Docker y los pasos en un servidor
> real todavía no se probaron** (no hubo Docker ni servidor disponibles). Lo que sí se comprobó: la app se
> construye en modo `standalone`, arranca, `/api/health` responde 503 sin base y el login y los estáticos
> responden 200. Haz el ensayo completo (sección 7) antes de mover clientes.

## 0. Qué se necesita (lo hace el dueño)
- Cuenta de **Hetzner** (o el proveedor que se elija) con tarjeta.
- Cuenta de **Cloudflare** (ya existe) para DNS, protección y R2.
- Una **llave SSH** propia: `ssh-keygen -t ed25519 -C "kr-admin"`; la pública va a los servidores.

## 1. Servidores
Crear **dos** servidores Ubuntu 24.04 en la misma ubicación (EE. UU. este si está disponible) y en la
**misma red privada**:

| Servidor | Tamaño inicial | Función |
|---|---|---|
| `kr-app` | CX23 o CX33 | Next.js + Caddy |
| `kr-db` | CX33 | PostgreSQL 17 |

Activar las **copias automáticas** del proveedor en los dos. Anotar la IP pública de `kr-app` y las IP
privadas de ambos.

## 2. Endurecer cada servidor (como root, una vez)
Copiar `infra/hardening/harden.sh` y ejecutar:
```bash
# En kr-app
ROLE=app ADMIN_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" bash harden.sh
# En kr-db
ROLE=db PRIVATE_CIDR=10.0.0.0/16 ADMIN_PUBKEY="$(cat ~/.ssh/id_ed25519.pub)" bash harden.sh
```
**Antes de cerrar la sesión**, abre otra terminal y comprueba `ssh deploy@IP`. Después de eso el acceso
por contraseña y por `root` queda bloqueado.

## 3. Base de datos (`kr-db`)
```bash
sudo mkdir -p /opt/kr-db /var/lib/kr-pg && sudo chown deploy: /opt/kr-db
# copiar infra/db/* a /opt/kr-db/ ; cp db.env.example db.env ; chmod 600 db.env ; editar contraseñas
cd /opt/kr-db && docker compose up -d
```
El primer arranque crea el rol `app_runtime` **sin BYPASSRLS** (`init/01-roles.sh`).

### Traer los datos desde Neon
1. Cerrar escrituras (ventana de mantenimiento, ver sección 8).
2. `pg_dump -Fc --no-owner "$DIRECT_URL_NEON" -f neon.dump`
3. `pg_restore --no-owner -d "postgresql://kr_owner:...@10.0.0.3:5432/kr_pos" neon.dump`
4. `psql "postgresql://kr_owner:...@10.0.0.3:5432/kr_pos" -f grants.sql` y comprobar que
   `rolbypassrls = false`.
5. Comparar conteos de `Company`, `Sale`, `Product` entre Neon y el servidor nuevo.

## 4. App (`kr-app`)
```bash
sudo mkdir -p /opt/kr/certs && sudo chown -R deploy: /opt/kr
# copiar infra/app/* a /opt/kr/ ; cp app.env.example app.env ; chmod 600 app.env ; completar valores
sudo cp infra/cron/kr-cron.sh /usr/local/bin/ && sudo cp infra/cron/kr-pos.cron /etc/cron.d/kr-pos
```
**Certificado:** Cloudflare → SSL/TLS → Origin Server → *Create Certificate* → guardar como
`/opt/kr/certs/origin.pem` y `origin.key` (permisos 600). En Cloudflare poner el modo **Full (strict)**.

**Secretos en GitHub** (*Settings → Secrets → Actions*): `DEPLOY_HOST` (IP de `kr-app`),
`DEPLOY_SSH_KEY` (llave privada de despliegue), `DEPLOY_KNOWN_HOSTS` (salida de `ssh-keyscan IP`),
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, y `GHCR_READ_TOKEN` si el paquete es privado.
Crear en GitHub el *environment* `produccion` con **aprobación obligatoria**.

**Primer despliegue:** *Actions → Desplegar en el servidor propio → Run workflow*.

**Migraciones** (siempre a mano y aprobadas, igual que hoy):
```bash
cd /opt/kr && TAG=<version> docker compose --profile tools run --rm migrate
```
Después, si hay tablas nuevas, volver a correr `grants.sql`.

## 5. Cloudflare
- DNS: `krpos` → IP de `kr-app`, **nube naranja** (con proxy).
- Reglas recomendadas: límite de peticiones en `/login` y `/api/auth/*`; *Bot Fight Mode* activado.
- Una vez que todo funcione, bloquear 80/443 a todo lo que no sea Cloudflare (ya lo hace `harden.sh`).

## 6. Respaldos y vigilancia
- Cambiar el secreto `BACKUP_DATABASE_URL` por la conexión directa de `kr-db` (ver `respaldos.md`).
- Monitor externo sobre `https://krpos.krsystem-corp.com/api/health` (Uptime Kuma, Better Stack, etc.).
- Probar una restauración real antes del corte.

## 7. Ensayo (obligatorio antes de mover clientes)
En un dominio de pruebas con una copia de los datos: iniciar sesión, hacer una venta, cerrar caja, ver
reportes, abrir `/admin`, subir un comprobante, ejecutar a mano las dos tareas programadas, matar la app
(`docker compose stop app`) y ver que el monitor avisa, y **restaurar un respaldo en otra base**.

## 8. Corte
1. Avisar a los clientes (ventana corta, de madrugada).
2. Poner Vercel en modo de solo lectura o pausar escrituras; hacer el volcado final de Neon y restaurarlo.
3. Correr migraciones pendientes y `grants.sql`; comprobar `/api/health`.
4. Cambiar el DNS (`krpos`) al servidor nuevo. Probar login y una venta.
5. Dejar **Vercel y Neon intactos 1–2 semanas** como vuelta atrás.

**Vuelta atrás:** solo es limpia durante los primeros minutos (lo escrito en el servidor nuevo no existe
en Neon). Pasado ese tiempo, volver implica copiar los datos nuevos hacia Neon.

## 9. Si algo falla
| Síntoma | Qué mirar |
|---|---|
| El sitio no abre | `docker compose ps` y `logs caddy` en `kr-app`; certificado de origen; modo SSL de Cloudflare |
| `/api/health` da 503 | `logs app`; conexión a `10.0.0.3:5432`; `docker compose ps` en `kr-db` |
| Pantallas vacías tras migrar | Faltó `grants.sql` (el rol `app_runtime` no tiene permisos) |
| Disco lleno | `docker system df`; logs; tamaño de `/var/lib/kr-pg` |
| Ataque o tráfico raro | Cloudflare → *Under Attack Mode*; revisar eventos del firewall |
| Se filtró una clave | Cambiarla en `app.env`, `docker compose up -d app`; rotar `AUTH_SECRET` cierra todas las sesiones |

## 10. Cada mes
Probar restauración de un respaldo, revisar `unattended-upgrades` y reiniciar si pide, revisar espacio en
disco, y revisar el uso de CPU y memoria para decidir si toca subir de tamaño.

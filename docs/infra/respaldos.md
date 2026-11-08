# Respaldos de la base de datos (R2 + B2)

Un flujo de GitHub (`.github/workflows/respaldo-bd.yml`) copia la base de datos **cada 6 horas**,
la **cifra** y la sube a:

- **Cloudflare R2** — copia principal (carpeta `bd/`, 30 días de historial).
- **Backblaze B2** — segunda copia en otro proveedor (opcional pero recomendada).

Las copias van cifradas con [age](https://github.com/FiloSottile/age): quien tenga el bucket pero
no la llave privada no puede leerlas. **La llave privada solo la tiene el dueño.**

> R2 y B2 guardan archivos; **no son la base de datos**. La base vive en Neon hoy y en el
> Postgres del servidor propio mañana. El flujo funciona con cualquiera de las dos: solo cambia
> el secreto `BACKUP_DATABASE_URL`.

## 1. Configuración (una sola vez)

### a) Llave de cifrado
En tu computadora:
```bash
age-keygen -o respaldo-key.txt
```
- La línea `# public key: age1...` va en el secreto `BACKUP_AGE_PUBLIC_KEY`.
- **`respaldo-key.txt` (la llave privada) guárdala en un gestor de contraseñas y una copia en papel
  o USB. Sin ella los respaldos no se pueden abrir. No la subas a GitHub.**

### b) Cloudflare R2
1. Cloudflare → R2 → crear un bucket privado (por ejemplo `kr-respaldos`).
2. R2 → *Manage API tokens* → token con permiso **Object Read & Write limitado a ese bucket**.
3. Anota: *Account ID*, *Access Key ID*, *Secret Access Key* y el nombre del bucket.

### c) Backblaze B2 (segunda copia)
1. B2 → crear un bucket **privado** (por ejemplo `kr-respaldos-b2`).
2. *Application Keys* → clave **limitada a ese bucket** con lectura y escritura.
3. Anota: *keyID*, *applicationKey* y el nombre del bucket.

### d) Base de datos
`BACKUP_DATABASE_URL` debe ser la conexión **directa** (no la del *pooler*) de un rol que pueda
leer todas las tablas **saltándose RLS** (`BYPASSRLS`, por ejemplo el dueño de la base). Hoy es la
misma que `DIRECT_URL`.

### e) Aviso si el respaldo deja de correr (recomendado)
Crea un chequeo gratuito en healthchecks.io con período de 6 horas y gracia de 2 horas, y pon su
URL en `BACKUP_HEALTHCHECK_URL`. Si pasa tiempo sin que llegue el aviso, te escribe.

### f) Secretos en GitHub
Repositorio → Settings → Secrets and variables → Actions → *New repository secret*:

| Secreto | Obligatorio |
|---|---|
| `BACKUP_DATABASE_URL` | sí |
| `BACKUP_AGE_PUBLIC_KEY` | sí |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | sí |
| `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET` | no (segunda copia) |
| `BACKUP_HEALTHCHECK_URL` | no (aviso de fallo) |

Sin los obligatorios, el flujo no falla: avisa y se omite.

## 2. Probar
Actions → *Respaldo de la base de datos* → *Run workflow*. Debe terminar en verde y aparecer un
archivo `bd/bd-AAAAMMDD-HHMMSS.dump.age` en R2 (y en B2 si lo configuraste).

## 3. Restaurar (en una base de pruebas, nunca encima de producción)
```bash
# 1. Descargar la copia más reciente (rclone configurado con tu remoto r2 o b2)
rclone copyto r2:kr-respaldos/bd/bd-AAAAMMDD-HHMMSS.dump.age copia.dump.age

# 2. Descifrar con la llave privada
age -d -i respaldo-key.txt -o copia.dump copia.dump.age

# 3. Restaurar en una base vacía
createdb kr_restauracion
pg_restore --no-owner -d kr_restauracion copia.dump
```
Después de restaurar:
- Crea el rol `app_runtime` si no existe y vuelve a aplicar los permisos (las migraciones los traen).
- Comprueba el conteo de filas de `Company`, `Sale` y `Product` contra producción.

## 4. Prueba de restauración mensual (obligatoria)
**Un respaldo que nunca se restauró no es un respaldo.** Una vez al mes: descarga la última copia,
restáurala como arriba, abre la app apuntando a ella y confirma que se ven ventas e inventario.
Anota la fecha y el resultado.

## 5. Qué NO cubre
- Pérdida de la llave privada (las copias quedan ilegibles).
- Cambios entre una copia y la siguiente: se pueden perder hasta 6 horas de datos. Para menos,
  el Postgres del servidor propio añade archivado continuo (WAL) y punto exacto de recuperación.
- Fotos y videos: viven aparte (la foto de producto hoy está dentro de la base y por eso sí queda
  en la copia).

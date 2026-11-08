#!/bin/bash
# Se ejecuta UNA vez, al crear la base por primera vez.
# Crea el rol de la app SIN poder saltarse RLS (el aislamiento entre empresas depende de esto).
set -euo pipefail
: "${APP_RUNTIME_PASSWORD:?Falta APP_RUNTIME_PASSWORD}"
psql -v ON_ERROR_STOP=1 -v pw="$APP_RUNTIME_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE app_runtime LOGIN NOBYPASSRLS PASSWORD :'pw';
GRANT CONNECT ON DATABASE kr_pos TO app_runtime;
SQL

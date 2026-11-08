-- Se ejecuta DESPUÉS de correr las migraciones (y cada vez que haya tablas nuevas sin GRANT).
-- Es el mismo bloque de la auditoría (SEC-003). Ejecutar como kr_owner:
--   psql "$DIRECT_URL" -f grants.sql
ALTER ROLE app_runtime NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;

-- Comprobación: rolbypassrls debe salir en false.
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_runtime';

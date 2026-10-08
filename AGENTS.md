<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Trabajo conjunto entre agentes (Claude y ChatGPT)

KR POS lo mejoran varias IA sobre el mismo repositorio. Para no pisarnos:

- **Ramas:** cada agente trabaja en su propia rama (`claude/<tema>`, `chatgpt/<tema>`). Nunca se empuja directo a `main`; los cambios entran por revisión del otro agente y la aprobación del dueño.
- **Producción:** no se aplican migraciones ni se escribe en la base de producción sin autorización expresa del dueño. Las migraciones nuevas deben ser aditivas y seguras.
- **Pruebas:** se verifica contra una base de pruebas, nunca con ventas o datos de prueba en producción. `prisma/seed-pruebas.ts` se niega a correr contra la base de producción.
- **Secretos:** no se commitean `.env*`, llaves ni contraseñas. Tampoco `.claude/` ni skills de terceros.
- **Antes de abrir un cambio:** `npx tsc --noEmit`, `npx eslint .` y `npx next build` deben pasar.
- **Multi-empresa (RLS):** toda consulta a Prisma sobre datos de una empresa va dentro de `withTenant(companyId, ...)`; una consulta sin ese alcance puede devolver vacío en silencio.
- **Idioma y formato:** interfaz en español; montos en bolívares, euros y dólares con la tasa del día.
- **Despliegue:** solo con confirmación explícita del dueño.

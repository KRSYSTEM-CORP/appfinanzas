<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

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

# Reglas del rediseño KR POS (pegar en CLAUDE.md del repositorio)

Estás rediseñando KR POS para que quede igual a la preview guardada en `rediseno/`.

## Siempre
1. Antes de tocar una pantalla, lee su sección en `rediseno/ESPECIFICACION.md` y busca en `rediseno/referencia-lectura/` el tramo que le corresponde.
2. Trabaja **una fase de `rediseno/BRECHAS-Y-PLAN.md` (§6) a la vez**, en su propia rama `claude/<tema>`. No empieces la siguiente sin que el usuario lo pida.
   `AGENTS.md` manda sobre este archivo: `withTenant` en toda consulta, migraciones aditivas, nada contra producción, y `tsc`, `eslint` y `next build` en verde.
3. Usa solo las variables ya definidas en `app/globals.css` (coinciden con la preview; `rediseno/tokens.css` es la tabla de equivalencias). Prohibido escribir colores hex, radios o sombras sueltos en componentes.
4. Reutiliza los componentes base (§1 de la especificación). Si necesitas uno nuevo, créalo en la carpeta de componentes compartidos, no dentro del módulo.
5. Copia los textos de la interfaz **tal cual** de la referencia. No los reescribas ni los traduzcas.
6. Conserva la lógica de negocio, las rutas de API y los datos que ya funcionan. Este trabajo cambia la presentación y completa funciones que faltan; no reescribe el backend sin motivo.
7. Cada regla de negocio de §3.7 y cada permiso se valida también en el servidor.
8. Al terminar una fase: compila, corre las pruebas y el linter, y escribe un resumen corto con archivos tocados, lo que falta y cómo probarlo.

## Nunca
- Nunca leas completos los archivos de `rediseno/referencia/` (pesan hasta 850 KB). Usa `referencia-lectura/` con grep y lecturas por tramo.
- Nunca copies a producción los datos de ejemplo, el panel "Demo", los PIN de ejemplo ni los botones "Simular…".
- Nunca uses `localStorage` como base de datos ni `iframe`/`postMessage` entre módulos.
- Nunca guardes PIN, claves de sede o contraseñas sin hash.
- Nunca borres ni migres tablas con datos sin pedir confirmación.
- Nunca dejes una función simulada (toast sin efecto, dato fijo). Todo lo de §7 se implementa de verdad. Si falta una credencial externa, detente y pídela.
- Nunca implementes factura fiscal: queda bloqueada con "Próximamente".
- Nunca agregues cupones ni descuentos de suscripción. El único es Emprende a $10 el primer mes.
- Nunca pongas clientes, promociones o cuentas por cobrar fuera del módulo Marketing.

## Decisiones del dueño
Están en `rediseno/PROMPT-MAESTRO.md` (D1 a D10) y mandan sobre la preview: sin horario en Ajustes, sin cupones, factura fiscal con candado, modo sin internet actual, ganancia de Inicio actual, WhatsApp por QR en Marketing, IA con proveedor gratuito.

## Paridad visual
Medidas exactas en `rediseno/PARIDAD-VISUAL.md`. Cada fase se cierra con `node rediseno/visual/comparar.mjs <modulo>` e `informe.json` vacío.

## Si algo no está claro
- Preview y especificación se contradicen → vale lo que se ve en la preview en el navegador, salvo las decisiones D1 a D10.
- Dos definiciones en el código de la preview → vale la última del archivo.
- La preview y el sistema actual chocan en una regla de negocio → detente y pregunta.

## Cómo buscar en la referencia
- Texto visible: `grep -n "Lista de reposición" rediseno/referencia-lectura/03-inventario.html`
- Estilos de una clase: `grep -o "\.kpi[^}]*}" rediseno/referencia-lectura/01-inicio.html`
- Iconos: objeto `IC` (buscar `var IC=` y `Object.assign(IC`).

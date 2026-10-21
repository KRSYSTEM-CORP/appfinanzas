This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Pruebas

- **Unitarias (Vitest):** `npm test` — IVA, descuentos, pagos mixtos e IGTF. No usan base de datos.
- **E2E (Playwright):** contra la app local apuntando a la **base de pruebas**, nunca a producción.
  1. Base de pruebas en `.env.pruebas` (y el rol `app_runtime` en `.env.pruebas.runtime`), con `npx prisma migrate deploy` y `npx tsx prisma/seed-pruebas.ts`.
  2. `set -a; . ./.env.pruebas; . ./.env.pruebas.runtime; set +a; npm run dev -- -p 3003`
  3. En otra terminal: `npx playwright install chromium` (una vez) y `npm run test:e2e`.
- **Integración:** `npm run test:integration` corre las acciones de venta reales (venta, números de control, reintentos, notas de crédito, abonos) contra una base de pruebas. Necesita `DATABASE_URL` (rol `app_runtime`) y `DIRECT_URL` (dueño) de la base de pruebas; se niega a correr contra producción.
- **CI:** `.github/workflows/ci.yml` corre eslint, tsc, Vitest y `npm audit` en cada PR y en `main`. `.github/workflows/integration.yml` crea en cada PR una copia temporal de la base de pruebas en Neon (secreto `NEON_API_KEY`), corre las pruebas de integración y la borra.

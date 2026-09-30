# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are owners and employees of micro/small businesses in Venezuela — emprendedores running a retail counter, a small shop, or a service business, plus their cashiers (VENDEDOR role) and managers (GERENTE role). They work at a physical point of sale (counter, tablet, or phone) under time pressure with a customer waiting, and separately do back-office work (inventory, reports, accounting) at a desk. Not technical; Spanish is the only supported language.

## Product Purpose

KR POS is an all-in-one business management system: point of sale, quotes, inventory, customers, reports, documents, finance/accounting, purchases, employees, branches, settings, and billing/subscription. It exists to replace the notebook-and-calculator workflow small Venezuelan businesses default to, and to work reliably in a market where power and internet outages are routine and where prices must live in two currencies at once.

## Positioning

Two differentiators competitors and manual methods don't cover: (1) it keeps working — a cashier can complete a sale with the real catalog and stock visible even with no internet or power, and it syncs automatically once connectivity returns (see lib/offline/*, public/sw.js); (2) every price is carried in bolívares and a reference currency (EUR/USD) simultaneously with automatic daily-rate conversion, not a manual side calculation.

## Operating Context

- Point of sale is used standing at a counter or on a tablet, often one-handed, with a customer present — every extra tap has a real cost.
- Back-office screens (inventory, reports, accounting, employees) are used seated, at a desk, with more time but still by a non-technical owner.
- Multi-branch businesses exist; a GERENTE can view "todas las sucursales" or switch to one; a VENDEDOR is pinned to their own branch.
- Roles: GERENTE (full access + billing/config/accounting/employees) and VENDEDOR (scoped to `allowedSections`, empty = unrestricted). A platform super-admin role also exists (`/admin`).
- Runs as a responsive web app (Next.js) and is also wrapped natively via Capacitor for iOS/Android — the design language stays web/responsive, not native-per-OS.
- Thermal-printer and PDF printing are real, used-daily flows (receipts, facturas, notas de entrega) — not an edge case.

## Capabilities and Constraints

- Stack: Next.js 16 (App Router, Server Actions — `AGENTS.md` warns this version has breaking API changes from trained knowledge), React 19, Tailwind CSS 4, shadcn/ui (`components/ui/*`: button, card, input, label, select, dialog, table, badge, popover, separator, textarea), `@base-ui/react` as the headless primitive layer, `lucide-react` icons, `class-variance-authority` for variants, Prisma 7 + Postgres with row-level security (`lib/tenant-db.ts`'s `withTenant`/`withSuperAdmin`), Upstash Redis caching.
- Design tokens already exist as CSS custom properties in `app/globals.css` (`--primary: #4f3ddb`, `--success`, `--warning`, `--destructive`, `--radius`, sidebar tokens, chart-1..5), consumed via Tailwind's `@theme inline`. A company can override background/accent per-tenant (`lib/theme-color.ts`'s `deriveBrandVars`), applied both signed-in and pre-auth on the login screen once the company is identified.
- **Confirmed hard constraint (verified in code, not to be changed as part of this redesign):** completing a sale requires customer first name, last name, phone, and address — all `min(1)` server-validated in `CustomerSchema`/`SaleSchema` (`lib/validations.ts`). There is currently no "sin cliente" / guest-checkout path. The redesign may restructure *how* this form is presented (layout, pacing, combining it with the cart view) but not remove the requirement — see Product Principles.
- Offline POS is a real, already-shipped feature (`app/pos/offline`, `components/pos/PosOfflineClient.tsx`, `lib/offline/*`) — a separate offline-shell route the service worker serves when the main `/pos` route can't be reached, backed by an IndexedDB snapshot of catalog/branch/company data kept warm by `useCatalogSync`.
- Nav (`components/nav/NavBar.tsx`) can render up to ~12 top-level items for a GERENTE (Punto de venta, Presupuestos, Inventario, Clientes, Reportes, Documentos, per-company custom feature links, Contabilidad, Administración de perfiles, Administración for super-admin, Configuración, Suscripción mensual) in one `overflow-x-auto` row on desktop, with the company name truncated to 120–180px — confirmed source of the "cramped/cut off" friction reported.
- Do not change business logic, pricing/tax/discount calculations, exchange-rate handling, permissions, authentication, data, or APIs as part of this visual redesign.

## Evidence on Hand

- Logo/icon: `public/icons/icon-192.png` / `icon-512.png` (also used as `public/logo.png` in the separate marketing-video project). Wordmark "KR POS", company display name "KR System".
- A parallel marketing project (`../kr-pos-reels`) already established a violet/coral brand system for social content (`primary #4f3ddb`, `accent #ff6b4a`) — the same violet already matches the app's existing `--primary` token, so the redesign should stay consistent with it rather than introduce a new hue.
- No existing screenshots/design files beyond the running app itself; app screens are the incumbent visual authority (see DESIGN.md once written via `/impeccable document` or produced through this redesign).

## Product Principles

1. Speed at the counter beats visual richness — the POS screen is the one place where every extra tap, unlabeled field, or slow render has a direct cost to a real transaction in progress.
2. Never relax a validated business rule to make the UI feel lighter — the customer-required-per-sale rule stays; only its presentation may change.
3. One coherent system, not a redesigned corner — colors, spacing, type, states, and components must be defined once (design tokens) and applied everywhere, so back-office screens (accounting, reports) feel like the same product as the counter screen.
4. Numbers are the product — bolívar/EUR/USD amounts, stock counts, and dates must stay legible, correctly formatted, and unambiguous at every size before any other visual concern.
5. Design for the non-technical owner first: Spanish-only, plain labels over icons-only, forgiving of small touch targets on a real counter tablet.

## Accessibility & Inclusion

Users include non-technical small-business owners and cashiers, on a range of devices (older Android tablets at some counters). Requirements explicitly called out by the client: sufficient contrast, full keyboard navigation, accessible labels (search inputs currently lack a clear accessible label per the client's own review), visible focus states, screen-reader-comprehensible names, and respecting `prefers-reduced-motion` for any added microinteractions.

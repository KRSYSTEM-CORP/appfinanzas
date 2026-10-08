# KR POS — design system

## Product context

KR POS is a Spanish-language point-of-sale and back-office system for Venezuelan micro and small businesses. Cashiers use it while a customer is waiting; owners use reports, inventory and accounting at a desk. The interface must remain legible on older Android phones and tablets, work with the existing offline workflows, and show local and reference-currency prices clearly.

## Visual direction

Keep the recognizable KR violet as the primary action color. Use cool, quiet neutral surfaces, restrained shadows and consistent rounded corners. Coral is a small brand accent for promotional surfaces, never a status color. Keep the signed-in workspace light by default; retain a complete dark theme for users who choose it. Avoid decorative gradients on frequent controls, persistent motion, and equal-weight grids of cards.

## Tokens

| Role | Token | Default |
| --- | --- | --- |
| Page canvas | `--background` | `#f7f7fb` |
| Main text | `--foreground` | `#1e1b2e` |
| Raised surface | `--card` / `--popover` | `#ffffff` |
| Primary action | `--primary` | `#4f3ddb` |
| Soft brand surface | `--secondary` / `--accent` | `#efedfb` |
| Quiet surface | `--muted` | `#f1f0f6` |
| Secondary text | `--muted-foreground` | `#625f73` |
| Border/input | `--border` / `--input` | `#e5e3ed` / `#dedce8` |
| Success | `--success` | `#168158` |
| Warning | `--warning` | `#a66b0b` |
| Destructive | `--destructive` | `#d03b3b` |
| Type | `--font-sans` | Geist Sans |
| Numerals | inherited `tabular-nums` | Use for prices, quantities, dates and counts |
| Shape | `--radius` | `0.75rem` |

Tenant branding may override neutral/accent tokens through `lib/theme-color.ts`; preserve that contract. Chart colors and success/warning/destructive remain semantic and must not be repurposed for decoration.

## Screen patterns

### Point of sale

- Optimize for quick scanning and one-handed touch on a counter device.
- Keep customer, product, cart and checkout actions visually distinct without changing the current required customer fields or sale rules.
- Keep prices, quantities, currency and stock at the point of decision.
- Preserve offline status, queued sale feedback, print flows and their prominent states.

### Back office

- Put the page title and primary action first, then search/filters, then results.
- Use compact category summaries on narrow screens; do not require horizontal scrolling to read stock or totals.
- Use list rows for inventory because name, stock, state and two-currency price matter more than product imagery.
- Use charts only when they help answer a business question; color encodes meaning consistently.

## Components and interaction

- Use the existing `components/ui/*` shadcn/Base UI components and Lucide icons.
- Primary buttons and inputs are 36px or taller on desktop and 44px or taller on touchscreens. Keep compact secondary controls rare and separated from neighboring targets.
- Keep visible keyboard focus; do not rely on color alone for status.
- Use motion to confirm a user action or explain a spatial change. Keep common feedback quick; respect `prefers-reduced-motion`.
- Empty, loading, error and offline states should tell the user what happened and offer a next action when possible.

## Non-negotiable product constraints

Do not change authentication, role/branch access, tenant isolation, required customer data, tax/discount/payment calculations, currency conversion, API contracts, offline sync, or production data as part of a visual redesign. Do not introduce fake metrics or decorative data into operational screens.

## Implementation notes

- Stack: Next.js 16 App Router, React 19, Tailwind CSS 4, Base UI primitives, shadcn components and Lucide.
- Global visual tokens live in `app/globals.css`; shared primitives live in `components/ui/`.
- For changes that touch Next APIs, read the corresponding Next 16 guide shipped in `node_modules/next/dist/docs/` first.
- On narrow layouts, verify the 360–390px range and preserve the fixed bottom navigation/safe area.

// Shared by the server (lib/actions/sales.ts) and the client-side offline
// receipt preview (components/pos/PosClient.tsx) so both compute the exact
// same per-cent-rounded discount for a line — summing these per-item always
// matches the server's authoritative total exactly, which the "exact
// payment match" checkout validation depends on (see assertPaymentsMatchTotal
// in lib/payment-currency.ts).
export function computeItemDiscountCents(rawSubtotalCents: number, discountPercent: number): number {
  return Math.round((rawSubtotalCents * discountPercent) / 100);
}

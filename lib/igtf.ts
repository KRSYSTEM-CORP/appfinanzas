// IGTF (Impuesto a las Grandes Transacciones Financieras): a percentage
// (3% by default) on what a customer pays in foreign currency, charged only
// by companies designated as IGTF agents (audit KRPOS-FIS-001). It is
// collected ON TOP of the sale total, so it never changes totalCents, the
// IVA base, or how payments are matched against the total.

// Payment lines in a currency other than the company's local one (dollars by
// Zelle, Binance, PayPal or cash "divisas").
export function computeIgtfCents(
  payments: { currencyCode: string; amountEurCents: number }[],
  localCurrencyCode: string,
  ratePercent: number
): number {
  const foreignCents = payments
    .filter((p) => p.currencyCode !== localCurrencyCode)
    .reduce((sum, p) => sum + p.amountEurCents, 0);
  return Math.round((foreignCents * ratePercent) / 100);
}

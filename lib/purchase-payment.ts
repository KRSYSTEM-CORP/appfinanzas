// Lógica pura de abonos a compras (centavos de la moneda de referencia).
export function purchaseRemaining(totalCents: number, ivaRetainedCents: number, paidCents: number): number {
  return totalCents - ivaRetainedCents - paidCents;
}

// El abono liquida la compra cuando cubre (o supera por redondeo) el saldo pendiente.
export function paymentSettlesPurchase(amountCents: number, remainingCents: number): boolean {
  return amountCents >= remainingCents;
}

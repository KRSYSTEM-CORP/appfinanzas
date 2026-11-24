// Devolución de dinero al anular una venta que ya tenía cobros. Solo el efectivo sale de la caja
// física: se registra como salida de Caja Chica (CashOutflow) atada a la venta. Sin dependencias de
// servidor para poder probarla en vitest.

export type RefundPaymentLike = { paymentMethod: string; amountEurCents: number };

// Efectivo realmente cobrado (en la divisa de referencia), sumando pago inicial y abonos.
export function cashRefundCents(payments: RefundPaymentLike[]): number {
  return payments.filter((p) => p.paymentMethod === "CASH").reduce((a, p) => a + p.amountEurCents, 0);
}

export function refundConcept(saleNumber: number | string): string {
  return `Devolución por anulación de venta N.º ${saleNumber}`;
}

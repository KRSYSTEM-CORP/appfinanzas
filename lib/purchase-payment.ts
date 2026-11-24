import type { PaymentMethod } from "@prisma/client";
import { resolvePaymentCurrency } from "@/lib/payment-currency";

// Un abono a una compra llega en la moneda de referencia; aquí se decide en qué moneda salió realmente según el método
// (bolívares para pago móvil, punto de venta, transferencia y efectivo Bs; divisa para Zelle, Binance, PayPal) y se calcula
// el monto en esa moneda para guardarlo como las demás líneas de pago (así la cuenta de origen se descuenta bien).
export function buildPurchasePaymentLine(
  method: PaymentMethod,
  refCents: number,
  ctx: { rate: number | null; localCurrencyCode: string; referenceCurrency: string; exchangeRateEnabled: boolean }
): { currencyCode: string; amountCurrencyCents: number } {
  const currencyCode = resolvePaymentCurrency(method, false, ctx.localCurrencyCode, ctx.exchangeRateEnabled, ctx.referenceCurrency);
  if (currencyCode === ctx.localCurrencyCode && currencyCode !== ctx.referenceCurrency) {
    if (ctx.rate == null) throw new Error("Configura la tasa de cambio antes de registrar un pago en bolívares.");
    return { currencyCode, amountCurrencyCents: Math.round(refCents * ctx.rate) };
  }
  return { currencyCode, amountCurrencyCents: refCents };
}

// Productos de una compra cuya mercancía ya no está completa en existencias (se vendió o salió): impide anularla en silencio.
export function stockShortfalls(needs: { name: string; quantity: number; stock: number | null }[]): string[] {
  return needs
    .filter((n) => n.stock != null && n.stock < n.quantity)
    .map((n) => `${n.name}: entraron ${n.quantity} y quedan ${n.stock}`);
}

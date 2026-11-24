import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { resolvePaymentCurrency } from "@/lib/payment-currency";
import type { PaymentMethod } from "@prisma/client";

// Presentación «la moneda del método primero»: si se cobra o se paga en bolívares (pago móvil, punto de venta, transferencia,
// efectivo en Bs) el monto se muestra en bolívares y debajo la referencia (USD/EUR); si es en divisa (Zelle, Binance, PayPal,
// efectivo en $), la divisa primero y debajo los bolívares. Los totales internos siguen en la moneda de referencia.

export type MoneyCtx = {
  rate: number | null;
  localCurrencyCode: string;
  referenceCurrency: string;
  exchangeRateEnabled: boolean;
};

// ¿Este método se cobra/paga en la moneda local (bolívares)?
export function isLocalMethod(method: PaymentMethod, paidInForeignCurrency: boolean, ctx: MoneyCtx): boolean {
  if (!ctx.exchangeRateEnabled) return false;
  const cur = resolvePaymentCurrency(method, paidInForeignCurrency, ctx.localCurrencyCode, ctx.exchangeRateEnabled, ctx.referenceCurrency);
  return cur === ctx.localCurrencyCode && cur !== ctx.referenceCurrency;
}

export type DualAmount = { primary: string; secondary: string | null; primaryIsLocal: boolean };

// Un monto en centavos de referencia, con la moneda del método primero. Sin tasa disponible solo muestra la referencia.
export function dualAmount(refCents: number, ctx: MoneyCtx, primaryLocal: boolean): DualAmount {
  const reference = formatCurrencyCents(ctx.referenceCurrency, refCents);
  if (!ctx.exchangeRateEnabled || ctx.rate == null) return { primary: reference, secondary: null, primaryIsLocal: false };
  const local = formatLocalCurrency(eurCentsToLocal(refCents, ctx.rate), ctx.localCurrencyCode);
  return primaryLocal ? { primary: local, secondary: reference, primaryIsLocal: true } : { primary: reference, secondary: local, primaryIsLocal: false };
}

// Un cobro/pago ya registrado: lo realmente pagado en SU moneda (amountCurrencyCents/currencyCode) primero y debajo el
// equivalente en la referencia. Para registros antiguos sin moneda de línea cae a la referencia.
export function paidAmount(
  line: { amountEurCents: number; amountCurrencyCents: number | null; currencyCode: string | null },
  referenceCurrency: string
): { primary: string; secondary: string | null } {
  const ref = formatCurrencyCents(referenceCurrency, line.amountEurCents);
  if (line.amountCurrencyCents == null || !line.currencyCode) return { primary: ref, secondary: null };
  if (line.currencyCode === referenceCurrency) return { primary: ref, secondary: null };
  return { primary: formatCurrencyCents(line.currencyCode, line.amountCurrencyCents), secondary: ref };
}

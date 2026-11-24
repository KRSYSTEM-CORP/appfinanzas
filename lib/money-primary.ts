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

// Monto con la moneda del método elegido primero; sin método (null) queda la referencia habitual con los bolívares debajo,
// como siempre. `foreign` distingue «Efectivo $» de «Efectivo Bs».
export function dualForMethod(refCents: number, method: { method: PaymentMethod; foreign: boolean } | null, ctx: MoneyCtx): DualAmount {
  const local = method ? isLocalMethod(method.method, method.foreign, ctx) : false;
  return dualAmount(refCents, ctx, local);
}

// Total de una venta ya cobrada: si todos los pagos se hicieron en la misma moneda, esa moneda va primero; si hay mezcla
// (o ningún pago) queda la referencia habitual.
export function dualForPayments(refCents: number, payments: { currencyCode: string | null }[], ctx: MoneyCtx): DualAmount {
  const codes = new Set(payments.map((p) => p.currencyCode));
  const only = codes.size === 1 ? [...codes][0] : null;
  const local = only != null && only === ctx.localCurrencyCode && only !== ctx.referenceCurrency;
  return dualAmount(refCents, ctx, local);
}

// «Bs 1.000,00 · $10,00» en una sola línea (botones, mensajes de error, textos de una línea).
export function dualInline(d: DualAmount): string {
  return d.secondary ? `${d.primary} · ${d.secondary}` : d.primary;
}

// Una línea de pago de compra ya registrada, con su moneda primero. Si quedó guardada la moneda real, se usa; en registros
// antiguos (sin moneda de línea) se decide por el método.
export type PaymentLineInput = {
  paymentMethod: PaymentMethod;
  paidInForeignCurrency: boolean;
  amountEurCents: number;
  amountCurrencyCents: number | null;
  currencyCode: string | null;
};
export function paymentLineAmount(line: PaymentLineInput, ctx: MoneyCtx): { primary: string; secondary: string | null } {
  if (line.amountCurrencyCents != null && line.currencyCode) return paidAmount(line, ctx.referenceCurrency);
  const d = dualAmount(line.amountEurCents, ctx, isLocalMethod(line.paymentMethod, line.paidInForeignCurrency, ctx));
  return { primary: d.primary, secondary: d.secondary };
}

// Una compra con pagos va en bolívares primero solo si TODOS sus pagos fueron en bolívares; a crédito o con alguna divisa,
// la referencia primero.
export function paymentsPrimaryLocal(payments: { paymentMethod: PaymentMethod; paidInForeignCurrency: boolean }[], ctx: MoneyCtx): boolean {
  return payments.length > 0 && payments.every((p) => isLocalMethod(p.paymentMethod, p.paidInForeignCurrency, ctx));
}

export type PurchaseStatus = "VOIDED" | "PAID" | "PARTIAL" | "CREDIT";
export function purchaseStatus(p: { voided: boolean; paymentStatus: "PAID" | "PENDING"; paidCents: number }): PurchaseStatus {
  if (p.voided) return "VOIDED";
  if (p.paymentStatus === "PAID") return "PAID";
  return p.paidCents > 0 ? "PARTIAL" : "CREDIT";
}

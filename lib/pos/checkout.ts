// Lógica pura de la pantalla de cobro del POS (sin React), igual a la preview:
// métodos de pago, montos en la moneda de cada método, pagos fraccionados,
// saldo pendiente, vuelto, IGTF y descuento. Todo en céntimos de la moneda de
// referencia (la misma de Sale.totalCents); el servidor vuelve a validar cada
// regla en completeSale (assertPaymentsMatchTotal, computeIgtfCents).
import type { PaymentAccountKind, PaymentMethod } from "@prisma/client";
import { getCurrency } from "@/lib/currencies";
import { resolvePaymentCurrency, tryToEurCents } from "@/lib/payment-currency";

export type PosMethodId = "pm" | "pv" | "tr" | "ebs" | "ed" | "zl" | "bn" | "pp";

export type PosMethod = {
  id: PosMethodId;
  label: string;
  method: PaymentMethod;
  foreign: boolean;
  // Tipo de cuenta de cobro cuyos datos se muestran al elegir el método.
  accountKind: PaymentAccountKind | null;
};

// Mismo orden y nombres que la preview.
export const POS_METHODS: PosMethod[] = [
  { id: "pm", label: "Pago Móvil", method: "CARD", foreign: false, accountKind: "PAGO_MOVIL" },
  { id: "pv", label: "Punto de venta", method: "POS", foreign: false, accountKind: null },
  { id: "tr", label: "Transferencia", method: "TRANSFER", foreign: false, accountKind: "TRANSFER" },
  { id: "ebs", label: "Efectivo Bs", method: "CASH", foreign: false, accountKind: null },
  { id: "ed", label: "Efectivo $", method: "CASH", foreign: true, accountKind: null },
  { id: "zl", label: "Zelle", method: "ZELLE", foreign: false, accountKind: "ZELLE" },
  { id: "bn", label: "Binance", method: "BINANCE", foreign: false, accountKind: "BINANCE" },
  { id: "pp", label: "PayPal", method: "PAYPAL", foreign: false, accountKind: "PAYPAL" },
];

export function posMethod(id: PosMethodId): PosMethod {
  return POS_METHODS.find((m) => m.id === id) ?? POS_METHODS[0];
}

// Sin tasa de cambio activa todo se cobra en la moneda de referencia: el
// efectivo es uno solo ("Efectivo").
export function visibleMethods(exchangeRateEnabled: boolean): PosMethod[] {
  if (exchangeRateEnabled) return POS_METHODS;
  return POS_METHODS.filter((m) => m.id !== "ebs").map((m) => (m.id === "ed" ? { ...m, label: "Efectivo" } : m));
}

export function isCashMethod(id: PosMethodId): boolean {
  return id === "ebs" || id === "ed";
}

// Igual que el servidor (validatePaymentSplits): todo lo que no es efectivo
// necesita referencia.
export function requiresReference(id: PosMethodId): boolean {
  return !isCashMethod(id);
}

// Método de la preview que corresponde al más usado hoy (resumen del día).
export function methodIdFor(method: PaymentMethod | null, exchangeRateEnabled: boolean): PosMethodId | null {
  if (!method) return null;
  if (method === "CASH") return exchangeRateEnabled ? "ebs" : "ed";
  return POS_METHODS.find((m) => m.method === method)?.id ?? null;
}

export type CurrencyCtx = {
  currencyCode: string; // moneda local de la empresa (VES…)
  rate: number | null;
  exchangeRateEnabled: boolean;
  referenceCurrency: string; // USD o EUR
};

export function methodCurrency(m: PosMethod, ctx: CurrencyCtx): string {
  return resolvePaymentCurrency(m.method, m.foreign, ctx.currencyCode, ctx.exchangeRateEnabled, ctx.referenceCurrency);
}

// "Bolívares (Bs)" / "Dólares ($)" como en la preview.
export function currencyCaption(code: string): string {
  if (code === "VES") return "Bolívares (Bs)";
  if (code === "USD") return "Dólares ($)";
  if (code === "EUR") return "Euros (€)";
  const c = getCurrency(code);
  return `${c.name.split(" (")[0]} (${c.symbol})`;
}

// "bolívares" / "dólares" para "Monto a cobrar en …".
export function currencyWord(code: string): string {
  if (code === "VES") return "bolívares";
  if (code === "USD") return "dólares";
  if (code === "EUR") return "euros";
  return getCurrency(code).name.split(" (")[0].toLowerCase();
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Acepta "53.852,30" (como se muestra), "53852,30" y "53852.30".
export function parseAmount(text: string): number {
  const s = String(text ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;
  let normalized: string;
  if (s.includes(",")) normalized = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) normalized = s.replace(/\./g, "");
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function formatAmount(n: number): string {
  return new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

// Monto en la moneda del método que equivale a `refCents` de la referencia.
export function refCentsToAmount(refCents: number, currency: string, ctx: CurrencyCtx): number {
  if (currency === "USD" || currency === ctx.referenceCurrency || ctx.rate == null) return round2(refCents / 100);
  return round2((refCents / 100) * ctx.rate);
}

export function amountToRefCents(amount: number, currency: string, ctx: CurrencyCtx): number {
  return tryToEurCents(Math.round(amount * 100), currency, ctx.rate, ctx.referenceCurrency) ?? 0;
}

export type PayLine = {
  id: PosMethodId;
  amount: number; // en la moneda del método
  refCents: number;
  reference: string;
};

export type PayMode = "full" | "split" | "debt";

// Convierte lo escrito (o, si está vacío, lo que falta) en un pago. Nunca
// cubre más de lo que falta, igual que la preview.
export function buildLine(
  id: PosMethodId,
  amountText: string,
  reference: string,
  remainingCents: number,
  ctx: CurrencyCtx
): PayLine | null {
  const m = posMethod(id);
  const cur = methodCurrency(m, ctx);
  const amount = amountText.trim() !== "" ? round2(parseAmount(amountText)) : refCentsToAmount(remainingCents, cur, ctx);
  if (!(amount > 0)) return null;
  let refCents = amountToRefCents(amount, cur, ctx);
  if (refCents <= 0) return null;
  if (refCents > remainingCents) {
    refCents = remainingCents;
    return { id, amount: refCentsToAmount(remainingCents, cur, ctx), refCents, reference: reference.trim() };
  }
  return { id, amount, refCents, reference: reference.trim() };
}

export type PaySummary = {
  paidCents: number; // lo cubierto (en modo completo con un método elegido, todo)
  remainingCents: number; // lo que falta según los pagos ya agregados
  saldoCents: number; // lo que se muestra como "Saldo pendiente"
  done: boolean;
};

export function paySummary(mode: PayMode, selected: PosMethodId | null, lines: PayLine[], totalCents: number): PaySummary {
  const paid = lines.reduce((s, l) => s + l.refCents, 0);
  const virtual = mode === "full" && selected != null && lines.length === 0;
  const remaining = Math.max(0, totalCents - paid);
  const saldo = virtual ? 0 : remaining;
  return { paidCents: virtual ? totalCents : paid, remainingCents: remaining, saldoCents: saldo, done: saldo <= 0 };
}

// IGTF sobre lo pagado en divisas (misma regla que lib/igtf.ts en el servidor:
// toda moneda distinta de la local). En modo completo, sobre el total.
export function igtfCents(
  mode: PayMode,
  selected: PosMethodId | null,
  lines: PayLine[],
  totalCents: number,
  ratePercent: number | null,
  ctx: CurrencyCtx
): number {
  if (ratePercent == null || mode === "debt") return 0;
  const isForeign = (id: PosMethodId) => methodCurrency(posMethod(id), ctx) !== ctx.currencyCode;
  if (mode === "full" && selected != null && lines.length === 0) {
    return isForeign(selected) ? Math.round((totalCents * ratePercent) / 100) : 0;
  }
  const foreign = lines.filter((l) => isForeign(l.id)).reduce((s, l) => s + l.refCents, 0);
  return Math.round((foreign * ratePercent) / 100);
}

// Filas que recibe completeSale (monto en la moneda de cada método).
export function toPaymentRows(lines: PayLine[]) {
  return lines.map((l) => {
    const m = posMethod(l.id);
    return { paymentMethod: m.method, amount: l.amount.toFixed(2), paidInForeignCurrency: m.foreign, reference: l.reference };
  });
}

// Vuelto (positivo) o faltante (negativo) del efectivo entregado.
export function changeDue(amount: number, received: number): number {
  return round2(received - amount);
}

// Billetes rápidos de la preview: Bs 10.000 … o $10 …
export function billValues(currency: string): number[] {
  return currency === "VES" ? [10000, 20000, 50000, 100000] : [10, 20, 50, 100];
}

// "Otro descuento" en monto → porcentaje (el servidor aplica porcentaje).
export function discountPercentFromAmount(amountCents: number, rawTotalCents: number): number {
  if (rawTotalCents <= 0 || amountCents <= 0) return 0;
  return Math.min(100, Math.round((amountCents / rawTotalCents) * 10000) / 100);
}

// Salidas de Caja Chica y devoluciones: de dónde salió el dinero y en qué moneda. Sin dependencias de servidor
// para poder probarlo en vitest. amountCents de CashOutflow sigue siendo la moneda de referencia; lo realmente
// pagado (moneda, monto y tasa) queda aparte.
import { lineInAccountCurrency } from "@/lib/account-money";
import type { PaymentMethod } from "@prisma/client";

export type OutflowCurrency = "LOCAL" | "REFERENCE";

// Lo que se elige al registrar una salida: método, cuenta (si el método usa una), moneda y monto en esa moneda.
export type OutflowSource = {
  paymentMethod: PaymentMethod;
  paymentAccountId?: string | null;
  currency: OutflowCurrency;
  // En centavos de la moneda elegida (Bs o divisa).
  amountCents: number;
};

export type OutflowMoneyCtx = {
  rate: number | null;
  rateEnabled: boolean;
  localCurrencyCode: string;
  referenceCurrency: string;
};

export type ResolvedOutflowAmount = {
  currencyCode: string;
  amountCurrencyCents: number;
  amountCents: number; // referencia
  exchangeRate: number | null;
};

// Moneda con la que sale el dinero: la de la cuenta si hay cuenta (VES = bolívares); sin cuenta, la que se eligió.
// Zelle, Binance y PayPal siempre son divisa.
export function outflowCurrencyFor(
  method: PaymentMethod,
  accountCurrency: string | null,
  requested: OutflowCurrency,
  ctx: Pick<OutflowMoneyCtx, "rateEnabled">
): OutflowCurrency {
  if (accountCurrency) return accountCurrency === "VES" ? "LOCAL" : "REFERENCE";
  if (method === "ZELLE" || method === "BINANCE" || method === "PAYPAL") return "REFERENCE";
  if (!ctx.rateEnabled) return "REFERENCE";
  return requested;
}

// Moneda inicial de un método sin cuenta: efectivo y los métodos en bolívares (pago móvil, transferencia, punto) en Bs.
export function defaultOutflowCurrency(method: PaymentMethod, rateEnabled: boolean): OutflowCurrency {
  if (!rateEnabled) return "REFERENCE";
  return method === "ZELLE" || method === "BINANCE" || method === "PAYPAL" ? "REFERENCE" : "LOCAL";
}

// ¿El usuario puede escoger entre Bs y divisa? Solo efectivo y «otro» sin cuenta, y solo si hay tasa.
// Línea completa al elegir un método: método, cuenta preseleccionada y moneda por defecto, todo en un solo cambio.
// (Antes se cambiaba el método y la cuenta por separado con la misma línea vieja, y la cuenta pisaba el método.)
export function lineForMethod(line: OutflowLine, method: PaymentMethod, accountId: string, rateEnabled: boolean): OutflowLine {
  return { ...line, method, accountId, currency: defaultOutflowCurrency(method, rateEnabled) };
}

export function canChooseOutflowCurrency(method: PaymentMethod, hasAccount: boolean, ctx: Pick<OutflowMoneyCtx, "rateEnabled" | "rate">): boolean {
  return !hasAccount && ctx.rateEnabled && ctx.rate != null && (method === "CASH" || method === "OTHER");
}

export function resolveOutflowAmount(currency: OutflowCurrency, enteredCents: number, ctx: OutflowMoneyCtx): ResolvedOutflowAmount {
  if (!Number.isInteger(enteredCents) || enteredCents <= 0) throw new Error("El monto debe ser mayor a 0");
  if (currency === "LOCAL") {
    if (!ctx.rateEnabled || !ctx.rate || ctx.rate <= 0) throw new Error("No hay una tasa de cambio activa para registrar la salida en bolívares.");
    const ref = Math.round(enteredCents / ctx.rate);
    if (ref < 1) throw new Error("El monto es demasiado pequeño para convertirlo a la divisa de referencia.");
    return { currencyCode: ctx.localCurrencyCode, amountCurrencyCents: enteredCents, amountCents: ref, exchangeRate: ctx.rate };
  }
  return { currencyCode: ctx.referenceCurrency, amountCurrencyCents: enteredCents, amountCents: enteredCents, exchangeRate: ctx.rate };
}

type OutflowMoneyRow = { amountCents: number; amountCurrencyCents: number | null; currencyCode: string | null; exchangeRate?: unknown };

// Lo que una salida descuenta de una cuenta, en la moneda de ella.
export function outflowDebitCents(o: OutflowMoneyRow, accountCurrency: string, currentRate: number | null): number {
  return lineInAccountCurrency(
    { amountEurCents: o.amountCents, amountCurrencyCents: o.amountCurrencyCents, currencyCode: o.currencyCode, exchangeRate: o.exchangeRate },
    accountCurrency,
    currentRate
  );
}

export type CashOutflowLike = OutflowMoneyRow & { paymentMethod: PaymentMethod | null };

// Sale de la caja física solo si es efectivo (o una salida anterior, que siempre fue efectivo).
export function isCashOutflow(o: Pick<CashOutflowLike, "paymentMethod">): boolean {
  return o.paymentMethod == null || o.paymentMethod === "CASH";
}

// Cuánto resta una salida de efectivo en cada moneda de la caja: en bolívares si se pagó en la moneda local; si no,
// en la referencia. Las salidas que no son efectivo no restan nada.
export function cashOutflowImpact(
  o: CashOutflowLike,
  localCurrency: string,
  referenceCurrency: string,
  rate: number | null
): { refCents: number; localCents: number } {
  if (!isCashOutflow(o)) return { refCents: 0, localCents: 0 };
  if (o.currencyCode && o.currencyCode === localCurrency && o.currencyCode !== referenceCurrency) {
    return { refCents: 0, localCents: o.amountCurrencyCents ?? (rate ? Math.round(o.amountCents * rate) : 0) };
  }
  return { refCents: o.amountCents, localCents: 0 };
}

export const OUTFLOW_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Pago Móvil",
  POS: "Punto de venta",
  TRANSFER: "Transferencia",
  ZELLE: "Zelle",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
  OTHER: "Otro",
};

// Cobros de una venta, para prellenar «¿cómo se devuelve el dinero?».
export type PaidLine = {
  paymentMethod: PaymentMethod;
  paymentAccountId: string | null;
  currencyCode: string | null;
  amountCurrencyCents: number | null;
  amountEurCents: number;
};

export type RefundDefaultLine = { paymentMethod: PaymentMethod; paymentAccountId: string | null; currency: OutflowCurrency; amountCents: number };

function isLocalPayment(p: PaidLine, localCurrency: string, referenceCurrency: string): boolean {
  return p.currencyCode != null && p.currencyCode === localCurrency && p.currencyCode !== referenceCurrency;
}

// Agrupa los cobros por método, cuenta y moneda: lo cobrado en Bs se devuelve en Bs y lo cobrado en divisa, en divisa.
export function defaultRefundLines(payments: PaidLine[], localCurrency: string, referenceCurrency: string): RefundDefaultLine[] {
  const map = new Map<string, RefundDefaultLine>();
  for (const p of payments) {
    const local = isLocalPayment(p, localCurrency, referenceCurrency);
    const currency: OutflowCurrency = local ? "LOCAL" : "REFERENCE";
    const cents = local ? (p.amountCurrencyCents ?? 0) : p.amountEurCents;
    if (cents <= 0) continue;
    const key = `${p.paymentMethod}|${p.paymentAccountId ?? ""}|${currency}`;
    const row = map.get(key) ?? { paymentMethod: p.paymentMethod, paymentAccountId: p.paymentAccountId, currency, amountCents: 0 };
    row.amountCents += cents;
    map.set(key, row);
  }
  return [...map.values()];
}

// Una línea del formulario (salida o devolución): lo que se ve y se edita en pantalla.
export type OutflowLine = { method: PaymentMethod; accountId: string; currency: OutflowCurrency; amount: string };

// Moneda real de la línea: la de la cuenta elegida, o la que se escogió si el método lo permite.
export function lineCurrency(line: OutflowLine, accounts: { id: string; currency: string }[], rateEnabled: boolean): OutflowCurrency {
  const acc = line.accountId ? accounts.find((a) => a.id === line.accountId) : undefined;
  return outflowCurrencyFor(line.method, acc?.currency ?? null, line.currency, { rateEnabled });
}

// Convierte la línea del formulario en lo que recibe el servidor (monto en la moneda de la línea, en centavos).
export function lineToSource(line: OutflowLine, accounts: { id: string; currency: string }[], rateEnabled: boolean): OutflowSource {
  return {
    paymentMethod: line.method,
    paymentAccountId: line.accountId || null,
    currency: lineCurrency(line, accounts, rateEnabled),
    amountCents: Math.round((Number(line.amount.replace(",", ".")) || 0) * 100),
  };
}

// Tope de lo que se puede devolver (en centavos de referencia): lo cobrado, o su valor a la tasa del día si es mayor
// (la tasa cambia entre el cobro y la devolución y no debe trabar la devolución de lo cobrado).
export function maxRefundRefCents(payments: PaidLine[], localCurrency: string, referenceCurrency: string, rate: number | null): number {
  let original = 0;
  let today = 0;
  for (const p of payments) {
    original += p.amountEurCents;
    today += isLocalPayment(p, localCurrency, referenceCurrency) && p.amountCurrencyCents != null && rate ? Math.round(p.amountCurrencyCents / rate) : p.amountEurCents;
  }
  return Math.max(original, today) + 1;
}

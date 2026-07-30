import type { PaymentMethod } from "@prisma/client";
import { USD_DENOMINATED_METHODS } from "@/lib/format";

// Which currency a payment-split row is actually denominated in. Zelle,
// Binance and PayPal are always USD. When the company has disabled the
// exchange-rate feature entirely, every other method is just the company's
// single reference currency (there's no separate local currency to convert
// from/to anymore). Otherwise, Cash/Card/Other are the company's own local
// currency unless the merchant marked the row as paid in foreign cash
// ("Divisas"), in which case it's treated as USD too.
export function resolvePaymentCurrency(
  paymentMethod: PaymentMethod,
  paidInForeignCurrency: boolean,
  localCurrencyCode: string,
  exchangeRateEnabled: boolean,
  referenceCurrency: string
): string {
  if (USD_DENOMINATED_METHODS.includes(paymentMethod)) return "USD";
  if (!exchangeRateEnabled) return referenceCurrency;
  return paidInForeignCurrency ? "USD" : localCurrencyCode;
}

// Converts an amount denominated in `currencyCode` (in cents) to the
// reference-cent value Sale.totalCents uses. USD is treated as face-value-
// equal to the reference currency (the app's long-standing simplification —
// no real EUR/USD market rate is tracked anywhere), and so is an amount
// already denominated in the reference currency itself (e.g. every payment
// when exchangeRateEnabled is false).
export function toEurCents(
  amountCents: number,
  currencyCode: string,
  rate: number | null,
  referenceCurrency: string = "EUR"
): number {
  if (currencyCode === "USD" || currencyCode === referenceCurrency) return amountCents;
  if (rate == null) {
    throw new Error("Configura la tasa de cambio de tu empresa antes de continuar.");
  }
  return Math.round(amountCents / rate);
}

// Same conversion, but for client-side live-preview use: returns null instead
// of throwing when a rate is needed but missing, so the UI can show a
// "configure your rate" hint instead of crashing mid-render.
export function tryToEurCents(
  amountCents: number,
  currencyCode: string,
  rate: number | null,
  referenceCurrency: string = "EUR"
): number | null {
  if (currencyCode === "USD" || currencyCode === referenceCurrency) return amountCents;
  if (rate == null) return null;
  return Math.round(amountCents / rate);
}

// For SalePayment rows created before per-line currency tracking existed:
// approximates which currency the amount was actually in, purely from the
// payment method, so old sales still display sensibly.
export function legacyCurrencyForPayment(
  paymentMethod: PaymentMethod,
  referenceCurrency: string = "EUR"
): string {
  return USD_DENOMINATED_METHODS.includes(paymentMethod) ? "USD" : referenceCurrency;
}

type RawPaymentInput = {
  paymentMethod: PaymentMethod;
  amount: number;
  paidInForeignCurrency: boolean;
};

export type ResolvedPayment<T> = T & {
  currencyCode: string;
  amountCurrencyCents: number;
  amountEurCents: number;
};

// Resolves each payment-split row's currency and reference-cent equivalent
// from the company's local currency + exchange rate. Throws (via toEurCents)
// if a local-currency row is present but no rate is configured.
export function resolveSalePayments<T extends RawPaymentInput>(
  payments: T[],
  localCurrencyCode: string,
  rate: number | null,
  exchangeRateEnabled: boolean,
  referenceCurrency: string
): ResolvedPayment<T>[] {
  return payments.map((p) => {
    const currencyCode = resolvePaymentCurrency(
      p.paymentMethod,
      p.paidInForeignCurrency,
      localCurrencyCode,
      exchangeRateEnabled,
      referenceCurrency
    );
    return {
      ...p,
      currencyCode,
      amountCurrencyCents: p.amount,
      amountEurCents: toEurCents(p.amount, currencyCode, rate, referenceCurrency),
    };
  });
}

// Every payment-split entry has its own amountEurCents; the sum must equal
// the amount actually being paid (the sale total for a new sale, or the
// outstanding total when collecting a credit sale) — checked against the
// trusted server-computed total, never the client's own totalCents.
// Converting a locally-entered amount to its reference-cent equivalent
// involves rounding, so a mixed-currency split can be off from the exact
// total by a cent or two per locally-denominated line — allow that much
// slack instead of rejecting an otherwise-correct split over a rounding
// artifact.
export function assertPaymentsMatchTotal(
  resolved: { amountEurCents: number; currencyCode: string }[],
  totalCents: number,
  referenceCurrency: string = "EUR"
) {
  const sum = resolved.reduce((acc, p) => acc + p.amountEurCents, 0);
  const localLines = resolved.filter(
    (p) => p.currencyCode !== "USD" && p.currencyCode !== referenceCurrency
  ).length;
  const tolerance = localLines > 0 ? Math.max(1, localLines) : 0;
  if (Math.abs(sum - totalCents) > tolerance) {
    throw new Error(
      `La suma de los pagos (${(sum / 100).toFixed(2)}) no coincide con el total (${(totalCents / 100).toFixed(2)})`
    );
  }
}

// For an abono toward a credit sale's balance: unlike a full settlement
// (assertPaymentsMatchTotal, which must match exactly), a partial payment
// only needs to be more than zero and not exceed what's actually owed —
// the caller decides separately whether this abono happens to fully cover
// the remaining balance. Returns the resolved sum so callers don't have to
// re-add it themselves.
export function assertPaymentsWithinRemaining(
  resolved: { amountEurCents: number; currencyCode: string }[],
  remainingCents: number,
  referenceCurrency: string = "EUR"
): number {
  const sum = resolved.reduce((acc, p) => acc + p.amountEurCents, 0);
  if (sum <= 0) {
    throw new Error("Ingresa un monto de abono mayor a 0.");
  }
  const localLines = resolved.filter(
    (p) => p.currencyCode !== "USD" && p.currencyCode !== referenceCurrency
  ).length;
  const tolerance = localLines > 0 ? Math.max(1, localLines) : 0;
  if (sum - remainingCents > tolerance) {
    throw new Error(
      `El abono (${(sum / 100).toFixed(2)}) supera el saldo pendiente (${(remainingCents / 100).toFixed(2)})`
    );
  }
  return sum;
}

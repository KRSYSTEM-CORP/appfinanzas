"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MethodTiles } from "@/components/payments/MethodAndAccount";
import { formatAccountMoney } from "@/components/accounts/AddFundsDialog";
import { accountsForMethod } from "@/lib/payment-method-accounts";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHODS_REQUIRING_REFERENCE,
  USD_DENOMINATED_METHODS,
} from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency, getCurrency } from "@/lib/currencies";
import { resolvePaymentCurrency, tryToEurCents } from "@/lib/payment-currency";
import type { PaymentMethod, ReferenceCurrency } from "@prisma/client";

export type PaymentSplitRow = {
  paymentMethod: PaymentMethod;
  amount: string; // raw text input, in the row's own currency (see resolvePaymentCurrency) — converted to cents only at submit time
  paidInForeignCurrency: boolean;
  reference: string;
  // Solo cuando se pasan `accounts` (compras): cuenta de donde salió el dinero.
  paymentAccountId?: string;
};

// Cuenta bancaria o de cobro que puede ser el origen de un pago.
export type SourceAccount = { id: string; label: string; currency: string; kind?: string; balanceCents?: number };

export function defaultPaymentSplitRows(
  totalCents: number,
  rate: number | null,
  exchangeRateEnabled: boolean
): PaymentSplitRow[] {
  const amount = exchangeRateEnabled && rate != null ? eurCentsToLocal(totalCents, rate) : totalCents / 100;
  return [{ paymentMethod: "CASH", amount: amount.toFixed(2), paidInForeignCurrency: false, reference: "" }];
}

function toCentsOrZero(amount: string): number {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// How much of THIS row's own currency would settle whatever's left after
// every other row's contribution — computed from the shared reference-cents
// total so the cashier reading VES or USD doesn't have to convert a global
// EUR/USD balance in their head or reach for a calculator.
function refCentsToRowAmount(
  leftoverRefCents: number,
  rowCurrencyCode: string,
  rate: number | null,
  referenceCurrency: ReferenceCurrency
): number | null {
  if (rowCurrencyCode === "USD" || rowCurrencyCode === referenceCurrency) {
    return leftoverRefCents / 100;
  }
  if (rate == null) return null;
  return eurCentsToLocal(leftoverRefCents, rate);
}

// Sum of each row's amount, converted to its reference-cent equivalent (the
// same reference currency Sale.totalCents uses). A row that can't be
// converted yet (a local-currency row with no exchange rate configured)
// contributes 0 until the rate is set.
export function paymentSplitRowsTotalCents(
  rows: PaymentSplitRow[],
  localCurrencyCode: string,
  rate: number | null,
  exchangeRateEnabled: boolean,
  referenceCurrency: ReferenceCurrency
): number {
  return rows.reduce((sum, r) => {
    const cents = toCentsOrZero(r.amount);
    const currency = resolvePaymentCurrency(
      r.paymentMethod,
      r.paidInForeignCurrency,
      localCurrencyCode,
      exchangeRateEnabled,
      referenceCurrency
    );
    return sum + (tryToEurCents(cents, currency, rate, referenceCurrency) ?? 0);
  }, 0);
}

// Same tolerance the server applies (a mixed-currency split can be off by a
// cent or two per locally-denominated line, purely from rounding).
export function isPaymentSplitBalanced(
  rows: PaymentSplitRow[],
  localCurrencyCode: string,
  rate: number | null,
  totalCents: number,
  exchangeRateEnabled: boolean,
  referenceCurrency: ReferenceCurrency
): boolean {
  const assigned = paymentSplitRowsTotalCents(rows, localCurrencyCode, rate, exchangeRateEnabled, referenceCurrency);
  const localLines = rows.filter((r) => {
    const c = resolvePaymentCurrency(
      r.paymentMethod,
      r.paidInForeignCurrency,
      localCurrencyCode,
      exchangeRateEnabled,
      referenceCurrency
    );
    return c !== "USD" && c !== referenceCurrency;
  }).length;
  const tolerance = localLines > 0 ? Math.max(1, localLines) : 0;
  return Math.abs(assigned - totalCents) <= tolerance;
}

// For an abono toward a credit sale's balance: unlike checkout (which must
// balance exactly against the sale total), a partial payment only needs to
// be more than zero and not exceed what's actually owed — mirrors the
// server-side assertPaymentsWithinRemaining in lib/payment-currency.ts.
export function isPaymentSplitWithinRemaining(
  rows: PaymentSplitRow[],
  localCurrencyCode: string,
  rate: number | null,
  remainingCents: number,
  exchangeRateEnabled: boolean,
  referenceCurrency: ReferenceCurrency
): boolean {
  const assigned = paymentSplitRowsTotalCents(rows, localCurrencyCode, rate, exchangeRateEnabled, referenceCurrency);
  if (assigned <= 0) return false;
  const localLines = rows.filter((r) => {
    const c = resolvePaymentCurrency(
      r.paymentMethod,
      r.paidInForeignCurrency,
      localCurrencyCode,
      exchangeRateEnabled,
      referenceCurrency
    );
    return c !== "USD" && c !== referenceCurrency;
  }).length;
  const tolerance = localLines > 0 ? Math.max(1, localLines) : 0;
  return assigned - remainingCents <= tolerance;
}

// Shared by POS checkout and credit-sale collection: lets the user split a
// single total across multiple payment methods (e.g. half cash, half Pago
// Móvil) instead of picking just one.
export function PaymentSplitBuilder({
  rows,
  onChange,
  totalCents,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  idPrefix,
  // "exact" (default) requires the split to add up to exactly totalCents —
  // checkout at the POS. "upTo" allows anything from just above 0 up to
  // totalCents (used as the remaining balance) without requiring the full
  // amount — an abono toward a credit sale, which can be paid off gradually.
  mode = "exact",
  accounts,
}: {
  accounts?: SourceAccount[];
  rows: PaymentSplitRow[];
  onChange: (rows: PaymentSplitRow[]) => void;
  totalCents: number;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  idPrefix: string;
  mode?: "exact" | "upTo";
}) {
  const assignedCents = paymentSplitRowsTotalCents(rows, currencyCode, rate, exchangeRateEnabled, referenceCurrency);
  const remainingCents = totalCents - assignedCents;
  const balanced =
    mode === "upTo"
      ? isPaymentSplitWithinRemaining(rows, currencyCode, rate, totalCents, exchangeRateEnabled, referenceCurrency)
      : isPaymentSplitBalanced(rows, currencyCode, rate, totalCents, exchangeRateEnabled, referenceCurrency);
  const localCurrencyName = getCurrency(currencyCode).name.split(" (")[0];
  const needsRate =
    exchangeRateEnabled &&
    rate == null &&
    rows.some(
      (r) =>
        resolvePaymentCurrency(r.paymentMethod, r.paidInForeignCurrency, currencyCode, exchangeRateEnabled, referenceCurrency) !==
        "USD"
    );

  function updateRow(index: number, patch: Partial<PaymentSplitRow>) {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    const remaining = Math.max(0, remainingCents);
    const amount = exchangeRateEnabled && rate != null ? eurCentsToLocal(remaining, rate) : remaining / 100;
    onChange([
      ...rows,
      { paymentMethod: "CASH", amount: amount.toFixed(2), paidInForeignCurrency: false, reference: "" },
    ]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => {
        const isUsdMethod = USD_DENOMINATED_METHODS.includes(row.paymentMethod);
        const rowCurrencyCode = resolvePaymentCurrency(
          row.paymentMethod,
          row.paidInForeignCurrency,
          currencyCode,
          exchangeRateEnabled,
          referenceCurrency
        );
        const amountLabel = rowCurrencyCode === "USD" ? "USD" : exchangeRateEnabled ? localCurrencyName : rowCurrencyCode;
        const thisRowCents = tryToEurCents(toCentsOrZero(row.amount), rowCurrencyCode, rate, referenceCurrency) ?? 0;
        const leftoverRefCents = totalCents - (assignedCents - thisRowCents);
        const rowRemainingAmount =
          leftoverRefCents > 0 ? refCentsToRowAmount(leftoverRefCents, rowCurrencyCode, rate, referenceCurrency) : null;
        return (
          <div key={i} className="flex flex-col gap-2.5 rounded-[16px] bg-muted/60 p-3.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <MethodTiles
                  value={row.paymentMethod}
                  onChange={(method) => {
                    const next = accounts ? accountsForMethod(method, accounts) : [];
                    updateRow(i, { paymentMethod: method, paymentAccountId: next.length === 1 ? next[0].id : "" });
                  }}
                />
              </div>
              {rows.length > 1 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(i)}>
                  ✕
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${idPrefix}-amount-${i}`}>Monto ({amountLabel})</Label>
                <Input
                  id={`${idPrefix}-amount-${i}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.amount}
                  onChange={(e) => updateRow(i, { amount: e.target.value })}
                />
                {rowRemainingAmount != null && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Pendiente: {formatLocalCurrency(rowRemainingAmount, rowCurrencyCode)}
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="h-auto p-0 text-xs"
                      onClick={() => updateRow(i, { amount: rowRemainingAmount.toFixed(2) })}
                    >
                      Usar monto
                    </Button>
                  </div>
                )}
              </div>
              {PAYMENT_METHODS_REQUIRING_REFERENCE.includes(row.paymentMethod) && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${idPrefix}-reference-${i}`}>Nº de referencia</Label>
                  <Input
                    id={`${idPrefix}-reference-${i}`}
                    value={row.reference}
                    onChange={(e) => updateRow(i, { reference: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Ej. 001234567</p>
                </div>
              )}
            </div>

            {accounts && accountsForMethod(row.paymentMethod, accounts).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold">¿De qué cuenta salió el dinero?</span>
                {accountsForMethod(row.paymentMethod, accounts).map((a) => {
                  const on = row.paymentAccountId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => updateRow(i, { paymentAccountId: a.id })}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-[14px] border-2 px-3 py-2.5 text-left text-sm transition-colors",
                        on ? "border-primary bg-primary/12" : "border-transparent bg-muted"
                      )}
                    >
                      <span className="min-w-0 truncate font-semibold">{a.label}</span>
                      {a.balanceCents != null && (
                        <span className={cn("shrink-0 text-xs tabular-nums", a.balanceCents <= 0 ? "font-bold text-destructive" : "text-muted-foreground")}>
                          Saldo {formatAccountMoney(a.currency, a.balanceCents)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {isUsdMethod ? (
              <p className="text-xs text-muted-foreground">Este método se cobra siempre en USD.</p>
            ) : !exchangeRateEnabled ? (
              <p className="text-xs text-muted-foreground">Este método se cobra en {referenceCurrency}.</p>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!row.paidInForeignCurrency ? "default" : "outline"}
                  onClick={() => updateRow(i, { paidInForeignCurrency: false })}
                  className="flex-1"
                >
                  {localCurrencyName}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={row.paidInForeignCurrency ? "default" : "outline"}
                  onClick={() => updateRow(i, { paidInForeignCurrency: true })}
                  className="flex-1"
                >
                  Divisas (USD)
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <Button type="button" size="sm" variant="outline" onClick={addRow}>
        + Agregar otro método de pago
      </Button>

      {needsRate && (
        <p className="text-sm text-destructive">
          Configura la tasa de cambio para validar los montos en {localCurrencyName}.
        </p>
      )}
      <div className={`text-sm ${balanced ? "text-muted-foreground" : "text-destructive"}`}>
        Asignado: {formatCurrencyCents(referenceCurrency, assignedCents)}
        {exchangeRateEnabled &&
          rate != null &&
          ` (${formatLocalCurrency(eurCentsToLocal(assignedCents, rate), currencyCode)})`}{" "}
        de {formatCurrencyCents(referenceCurrency, totalCents)}
        {mode === "upTo"
          ? !balanced
            ? assignedCents <= 0
              ? " — ingresa un monto mayor a 0"
              : ` — supera el saldo pendiente por ${formatCurrencyCents(referenceCurrency, -remainingCents)}`
            : remainingCents > 0
              ? ` — quedará un saldo pendiente de ${formatCurrencyCents(referenceCurrency, remainingCents)}`
              : " — salda la deuda por completo"
          : !balanced &&
            (remainingCents > 0
              ? ` — faltan ${formatCurrencyCents(referenceCurrency, remainingCents)}`
              : ` — sobran ${formatCurrencyCents(referenceCurrency, -remainingCents)}`)}
      </div>
    </div>
  );
}

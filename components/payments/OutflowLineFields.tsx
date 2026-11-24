"use client";

import { MethodAndAccount, type PickableAccount } from "@/components/payments/MethodAndAccount";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { canChooseOutflowCurrency, defaultOutflowCurrency, lineCurrency, type OutflowLine } from "@/lib/cash-outflow";
import { formatCurrencyCents } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@prisma/client";

export type OutflowMoneyView = { rate: number | null; exchangeRateEnabled: boolean; localCurrencyCode: string; referenceCurrency: string };

// De dónde salió el dinero: método (mosaicos del cobro), cuenta con su saldo y monto en la moneda del método
// (Bs o divisa), con su equivalente a la tasa del día. Igual en Caja Chica y en la devolución al anular.
export function OutflowLineFields({
  line,
  onChange,
  accounts,
  money,
  amountLabel = "Monto",
}: {
  line: OutflowLine;
  onChange: (l: OutflowLine) => void;
  accounts: PickableAccount[];
  money: OutflowMoneyView;
  amountLabel?: string;
}) {
  const cur = lineCurrency(line, accounts, money.exchangeRateEnabled);
  const hasAccount = !!line.accountId;
  const canChoose = canChooseOutflowCurrency(line.method, hasAccount, { rateEnabled: money.exchangeRateEnabled, rate: money.rate });
  const typed = Math.round((Number(line.amount.replace(",", ".")) || 0) * 100);
  const curCode = cur === "LOCAL" ? money.localCurrencyCode : money.referenceCurrency;
  const equiv =
    typed > 0 && money.rate && money.exchangeRateEnabled
      ? cur === "LOCAL"
        ? formatCurrencyCents(money.referenceCurrency, Math.round(typed / money.rate))
        : formatCurrencyCents(money.localCurrencyCode, Math.round(typed * money.rate))
      : null;
  function pickMethod(m: PaymentMethod) {
    onChange({ ...line, method: m, currency: defaultOutflowCurrency(m, money.exchangeRateEnabled) });
  }
  return (
    <div className="flex flex-col gap-2">
      <MethodAndAccount
        method={line.method}
        onMethod={pickMethod}
        accounts={accounts}
        accountId={line.accountId}
        onAccount={(id) => onChange({ ...line, accountId: id })}
      />
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label={`${amountLabel} en ${curCode}`} className="mt-0">
          <input
            className={FIELD_CONTROL}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0,00"
            value={line.amount}
            onChange={(e) => onChange({ ...line, amount: e.target.value })}
          />
        </Field>
        {canChoose && (
          <div role="group" aria-label="Moneda" className="flex gap-1">
            {(["LOCAL", "REFERENCE"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cur === c}
                onClick={() => onChange({ ...line, currency: c })}
                className={cn("min-h-11 rounded-[12px] border-2 px-3 text-sm font-bold", cur === c ? "border-primary bg-primary/12" : "border-transparent bg-muted")}
              >
                {c === "LOCAL" ? money.localCurrencyCode : money.referenceCurrency}
              </button>
            ))}
          </div>
        )}
      </div>
      {equiv && <p className="text-xs text-muted-foreground tabular-nums">≈ {equiv} a la tasa del día</p>}
    </div>
  );
}

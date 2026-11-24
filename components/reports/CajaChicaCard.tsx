"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyCents } from "@/lib/currencies";
import { Price } from "@/components/money/Price";
import { addCashOutflow, deleteCashOutflow, type CashClosingSummary } from "@/lib/actions/cash-closing";
import { OutflowLineFields } from "@/components/payments/OutflowLineFields";
import { InsufficientFundsNotice, type FundsError } from "@/components/accounts/InsufficientFundsNotice";
import { useSourceAccountsReload } from "@/components/purchases/AccountSelect";
import { accountChoiceMessage } from "@/lib/payment-method-accounts";
import { expectedCashByCurrency } from "@/lib/cash-closing";
import { OUTFLOW_METHOD_LABEL, defaultOutflowCurrency, lineToSource, type OutflowLine } from "@/lib/cash-outflow";
import type { ReferenceCurrency } from "@prisma/client";
import { IncomeByMethodDialog } from "@/components/reports/IncomeByMethodDialog";

// Vista "Movimientos de Caja Chica": entradas y salidas del turno
// (apertura + ventas en efectivo − salidas = efectivo esperado) y el registro
// de salidas. Los montos se escriben en la divisa referencial.
export function CajaChicaCard({
  summary,
  canEdit,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
}: {
  summary: CashClosingSummary;
  canEdit: boolean;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [concept, setConcept] = useState("");
  const { accounts, reload } = useSourceAccountsReload(true);
  const [line, setLine] = useState<OutflowLine>({ method: "CASH", accountId: "", currency: defaultOutflowCurrency("CASH", exchangeRateEnabled), amount: "" });
  // Una clave por salida: si se reintenta (red lenta, doble toque) no se duplica.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [funds, setFunds] = useState<FundsError | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moneyView = useMemo(() => ({ rate, exchangeRateEnabled, localCurrencyCode: currencyCode, referenceCurrency }), [rate, exchangeRateEnabled, currencyCode, referenceCurrency]);
  const [isPending, startTransition] = useTransition();
  const byCur = expectedCashByCurrency({
    openingCents: summary.openingCents,
    openingRefCents: summary.openingRefCents,
    openingLocalCents: summary.openingLocalCents,
    incomeRows: summary.byAccount ?? [],
    outflows: summary.outflows,
    refundedCash: summary.refundedCash,
    rate,
    referenceCurrency,
    localCurrency: currencyCode,
  });
  const priceProps = { rate, currencyCode, exchangeRateEnabled, referenceCurrency };

  function run(action: () => Promise<{ success: boolean; error?: string; code?: string }>, after?: () => void) {
    setError(null);
    setFunds(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        after?.();
        router.refresh();
      } else if (result.code === "INSUFFICIENT_FUNDS") {
        setFunds(result as FundsError);
      } else {
        setError(result.error ?? "No se pudo guardar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <IncomeByMethodDialog summary={summary} referenceCurrency={referenceCurrency} />
      </div>
      {canEdit && (
        <Card>
          <CardContent>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const missing = accountChoiceMessage(line.method, accounts, line.accountId);
                if (missing) {
                  setError(missing);
                  return;
                }
                const source = lineToSource(line, accounts, exchangeRateEnabled);
                run(
                  () => addCashOutflow(summary.date, concept, source, requestKey),
                  () => {
                    setConcept("");
                    setLine((l) => ({ ...l, amount: "" }));
                    setRequestKey(crypto.randomUUID());
                  }
                );
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-concept">Registrar salida</Label>
                <Input id="cc-concept" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto (ej. Compra de bolsas)" required />
              </div>
              <OutflowLineFields line={line} onChange={setLine} accounts={accounts} money={moneyView} />
              {funds && <InsufficientFundsNotice failure={funds} accounts={accounts} onFunded={() => { setFunds(null); reload(); }} />}
              <div>
                <Button type="submit" disabled={isPending || !(Number(line.amount.replace(",", ".")) > 0)}>Registrar salida</Button>
              </div>
            </form>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {summary.byCurrency.length > 0 && (
        <Card>
          <CardContent className="flex flex-col divide-y">
            <p className="py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cobrado hoy por moneda (lo que realmente entró)</p>
            {summary.byCurrency.map((c) => (
              <div key={c.currencyCode} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-bold">{c.currencyCode === "VES" ? "Bolívares" : c.currencyCode === "USD" ? "Dólares" : c.currencyCode === "EUR" ? "Euros" : c.currencyCode}</span>
                <span className="text-right">
                  <span className="block font-extrabold tabular-nums">{formatCurrencyCents(c.currencyCode, c.cents)}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">ref. {formatCurrencyCents(priceProps.referenceCurrency ?? "EUR", c.refCents)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col divide-y">
          <div className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="font-bold">Apertura de caja (efectivo)</span>
            <span className="font-extrabold tabular-nums text-success">+<Price eurCents={summary.openingCents ?? 0} {...priceProps} /></span>
          </div>
          <div className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="font-bold">Ventas en efectivo</span>
            <span className="font-extrabold tabular-nums text-success">+<Price eurCents={summary.cashSalesCents} {...priceProps} /></span>
          </div>
          {summary.outflows.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-bold">{o.concept}</span>
                <span className="block text-xs text-muted-foreground">
                  {OUTFLOW_METHOD_LABEL[o.paymentMethod ?? "CASH"]}
                  {o.accountLabel ? ` · ${o.accountLabel}` : ""}
                  {o.paymentMethod && o.paymentMethod !== "CASH" ? " · no sale de la caja" : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-extrabold tabular-nums text-destructive">
                  −{o.currencyCode && o.amountCurrencyCents != null && o.currencyCode !== referenceCurrency ? formatCurrencyCents(o.currencyCode, o.amountCurrencyCents) : <Price eurCents={o.amountCents} {...priceProps} />}
                </span>
                {canEdit && (
                  <Button type="button" size="xs" variant="ghost" disabled={isPending} aria-label={`Quitar salida ${o.concept}`} onClick={() => run(() => deleteCashOutflow(summary.date, o.id))}>
                    Quitar
                  </Button>
                )}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 py-3 text-sm">
            <span className="font-bold">Efectivo esperado</span>
            <span className="text-right font-extrabold tabular-nums">
              <Price eurCents={summary.expectedCashCents} {...priceProps} />
              {exchangeRateEnabled && currencyCode !== referenceCurrency && (
                <span className="block text-xs font-semibold text-muted-foreground">
                  En caja: {formatCurrencyCents(referenceCurrency, byCur.refCents)} · {formatCurrencyCents(currencyCode, byCur.localCents)}
                </span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

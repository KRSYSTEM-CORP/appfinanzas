"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Price } from "@/components/money/Price";
import { addCashOutflow, deleteCashOutflow, type CashClosingSummary } from "@/lib/actions/cash-closing";
import type { ReferenceCurrency } from "@prisma/client";

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
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const priceProps = { rate, currencyCode, exchangeRateEnabled, referenceCurrency };

  function run(action: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        after?.();
        router.refresh();
      } else {
        setError(result.error ?? "No se pudo guardar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <Card>
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const cents = Math.round(Number(amount) * 100);
                run(
                  () => addCashOutflow(summary.date, concept, cents),
                  () => {
                    setConcept("");
                    setAmount("");
                  }
                );
              }}
            >
              <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                <Label htmlFor="cc-concept">Registrar salida</Label>
                <Input id="cc-concept" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Concepto (ej. Compra de bolsas)" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-amount">Monto</Label>
                <Input id="cc-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28" required />
              </div>
              <Button type="submit" disabled={isPending}>Registrar salida</Button>
            </form>
            {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
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
              <span className="min-w-0 truncate font-bold">{o.concept}</span>
              <span className="flex items-center gap-2">
                <span className="font-extrabold tabular-nums text-destructive">−<Price eurCents={o.amountCents} {...priceProps} /></span>
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
            <span className="font-extrabold tabular-nums"><Price eurCents={summary.expectedCashCents} {...priceProps} /></span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

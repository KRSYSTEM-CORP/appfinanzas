"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Price } from "@/components/money/Price";
import {
  addCashOutflow,
  deleteCashOutflow,
  setCashOpening,
  type CashClosingSummary,
} from "@/lib/actions/cash-closing";
import type { ReferenceCurrency } from "@prisma/client";

// Caja Chica del día: apertura, salidas de efectivo y efectivo esperado
// (apertura + ventas en efectivo − salidas). Los montos se escriben en la
// divisa referencial, igual que el resto de la contabilidad.
export function CajaChicaCard({
  summary,
  canEdit,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  onChanged,
}: {
  summary: CashClosingSummary;
  canEdit: boolean;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  onChanged: () => void;
}) {
  const [opening, setOpening] = useState(summary.openingCents != null ? String(summary.openingCents / 100) : "");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Cuando cambia el día mostrado, el campo de apertura se reinicia.
  const [syncedDate, setSyncedDate] = useState(summary.date);
  if (syncedDate !== summary.date) {
    setSyncedDate(summary.date);
    setOpening(summary.openingCents != null ? String(summary.openingCents / 100) : "");
  }

  const priceProps = { rate, currencyCode, exchangeRateEnabled, referenceCurrency };

  function run(action: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        after?.();
        onChanged();
      } else {
        setError(result.error ?? "No se pudo guardar");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card shadow-xs p-3 sm:col-span-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Caja Chica</span>
        <span className="text-xs text-muted-foreground">Efectivo del día</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Apertura</span>
          <Price eurCents={summary.openingCents ?? 0} {...priceProps} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Ventas en efectivo</span>
          <Price eurCents={summary.cashSalesCents} {...priceProps} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Efectivo esperado</span>
          <Price eurCents={summary.expectedCashCents} size="lg" {...priceProps} />
        </div>
      </div>

      {canEdit && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const cents = Math.round(Number(opening) * 100);
            run(() => setCashOpening(summary.date, cents));
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-opening">{summary.openingCents == null ? "Abrir caja con" : "Ajustar apertura"}</Label>
            <Input
              id="cc-opening"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="w-36"
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            {summary.openingCents == null ? "Abrir caja" : "Guardar"}
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Salidas ({summary.outflows.length})</span>
          <Price eurCents={summary.outflowsCents} {...priceProps} />
        </div>
        {summary.outflows.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
            <span className="truncate">{o.concept}</span>
            <span className="flex items-center gap-2">
              <span className="text-destructive">
                −<Price eurCents={o.amountCents} {...priceProps} />
              </span>
              {canEdit && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={isPending}
                  aria-label={`Quitar salida ${o.concept}`}
                  onClick={() => run(() => deleteCashOutflow(summary.date, o.id))}
                >
                  Quitar
                </Button>
              )}
            </span>
          </div>
        ))}
      </div>

      {canEdit && (
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
            <Input
              id="cc-concept"
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              placeholder="Concepto (ej. Compra de bolsas)"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-amount">Monto</Label>
            <Input
              id="cc-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28"
              required
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            Agregar
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

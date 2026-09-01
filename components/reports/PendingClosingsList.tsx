"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/money/Price";
import { formatDateOnly } from "@/lib/format";
import { closeCashRegister, type PendingClosing } from "@/lib/actions/cash-closing";
import type { ReferenceCurrency } from "@prisma/client";

export function PendingClosingsList({
  pendingDays,
  hasBranchSelected,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
}: {
  pendingDays: PendingClosing[];
  hasBranchSelected: boolean;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [closingDate, setClosingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose(date: string) {
    setError(null);
    setClosingDate(date);
    startTransition(async () => {
      const result = await closeCashRegister(date);
      if (!result.success) setError(`${date}: ${result.error}`);
      setClosingDate(null);
      router.refresh();
    });
  }

  if (pendingDays.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay días pendientes por cerrar en este período.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!hasBranchSelected && (
        <p className="text-xs text-muted-foreground">
          Selecciona una sucursal (arriba, en la barra) para poder cerrar estos días — no se puede
          cerrar caja desde &quot;Todas las sucursales&quot;.
        </p>
      )}
      <div className="flex flex-col divide-y rounded-lg border">
        {pendingDays.map((day) => (
          <div key={day.date} className="flex items-center justify-between gap-3 p-3 flex-wrap">
            <div className="flex flex-col">
              <span className="text-sm font-medium">{formatDateOnly(day.date)}</span>
              <span className="text-xs text-muted-foreground">{day.salesCount} ventas</span>
            </div>
            <div className="flex items-center gap-3">
              <Price
                eurCents={day.totalCents}
                rate={rate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!hasBranchSelected || (isPending && closingDate === day.date)}
                onClick={() => handleClose(day.date)}
              >
                {isPending && closingDate === day.date ? "Cerrando..." : "Cerrar caja"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

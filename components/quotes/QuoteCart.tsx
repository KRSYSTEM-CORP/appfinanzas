"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

export type QuoteCartLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  maxStock: number;
};

export function QuoteCart({
  lines,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  onIncrement,
  onDecrement,
  onRemove,
  note,
  onNoteChange,
  onGenerate,
  isPending,
  error,
}: {
  lines: QuoteCartLine[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onGenerate: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const total = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  return (
    <div className="flex flex-col h-full gap-3">
      <h2 className="font-semibold">Presupuesto</h2>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Agrega productos para armar el presupuesto.
          </p>
        )}
        {lines.map((line) => (
          <div key={line.productId} className="flex items-center justify-between gap-2 rounded-lg border p-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{line.name}</p>
              <p className="text-xs text-muted-foreground">
                {exchangeRateEnabled && rate != null
                  ? `${formatLocalCurrency(eurCentsToLocal(line.unitPriceCents, rate), currencyCode)} / ${formatCurrencyCents(referenceCurrency, line.unitPriceCents)} c/u`
                  : `${formatCurrencyCents(referenceCurrency, line.unitPriceCents)} c/u`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                onClick={() => onDecrement(line.productId)}
              >
                −
              </Button>
              <span className="w-6 text-center text-sm">{line.quantity}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={line.quantity >= line.maxStock}
                onClick={() => onIncrement(line.productId)}
              >
                +
              </Button>
            </div>
            <div className="w-28 text-right">
              <Price
                eurCents={line.unitPriceCents * line.quantity}
                rate={rate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onRemove(line.productId)}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">Total</span>
        <Price
          eurCents={total}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          size="lg"
          className="items-end"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quote-note">Nota (opcional)</Label>
        <Textarea
          id="quote-note"
          placeholder="Se imprime en el presupuesto"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        size="lg"
        disabled={lines.length === 0 || isPending}
        onClick={onGenerate}
      >
        {isPending ? "Generando..." : "Generar presupuesto"}
      </Button>
    </div>
  );
}

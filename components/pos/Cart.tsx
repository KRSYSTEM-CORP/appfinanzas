"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { PaymentSplitBuilder, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { PAYMENT_STATUS_LABELS } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { PaymentStatus, ReferenceCurrency } from "@prisma/client";

export type CartLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  maxStock: number;
};

export function Cart({
  lines,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  paymentStatus,
  onPaymentStatusChange,
  paymentRows,
  onPaymentRowsChange,
  onIncrement,
  onDecrement,
  onRemove,
  note,
  onNoteChange,
  onCheckout,
  isPending,
  error,
}: {
  lines: CartLine[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  paymentStatus: PaymentStatus;
  onPaymentStatusChange: (status: PaymentStatus) => void;
  paymentRows: PaymentSplitRow[];
  onPaymentRowsChange: (rows: PaymentSplitRow[]) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onCheckout: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const total = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  return (
    <div className="flex flex-col h-full gap-3">
      <h2 className="font-semibold">Carrito</h2>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Agrega productos para empezar una venta.
          </p>
        )}
        {lines.map((line) => (
          <div
            key={line.productId}
            className="flex items-center justify-between gap-2 border-b border-dashed border-border pb-2 last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{line.name}</p>
              <p className="font-mono tabular-nums text-xs text-muted-foreground">
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
        <Label htmlFor="sale-note">Nota (opcional)</Label>
        <Textarea
          id="sale-note"
          placeholder="Se imprime en la nota de entrega y la factura"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex gap-2">
        {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={paymentStatus === status ? "default" : "outline"}
            onClick={() => onPaymentStatusChange(status)}
            className="flex-1"
          >
            {PAYMENT_STATUS_LABELS[status]}
          </Button>
        ))}
      </div>

      {paymentStatus === "PAID" ? (
        <PaymentSplitBuilder
          rows={paymentRows}
          onChange={onPaymentRowsChange}
          totalCents={total}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          idPrefix="checkout"
        />
      ) : (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">
          Esta venta quedará pendiente de cobro. El método de pago y la moneda se registrarán
          cuando el cliente pague, desde la sección de Reportes.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        size="lg"
        disabled={lines.length === 0 || isPending}
        onClick={onCheckout}
      >
        {isPending ? "Procesando..." : "Completar venta"}
      </Button>
    </div>
  );
}

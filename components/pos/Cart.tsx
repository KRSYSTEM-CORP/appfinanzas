"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, eurCentsToVES, formatEUR, formatVES } from "@/lib/format";
import type { PaymentMethod } from "@prisma/client";

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
  paymentMethod,
  onPaymentMethodChange,
  paidInForeignCurrency,
  onPaidInForeignCurrencyChange,
  onIncrement,
  onDecrement,
  onRemove,
  onCheckout,
  isPending,
  error,
}: {
  lines: CartLine[];
  rate: number | null;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  paidInForeignCurrency: boolean;
  onPaidInForeignCurrencyChange: (value: boolean) => void;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
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
          <div key={line.productId} className="flex items-center justify-between gap-2 rounded-lg border p-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{line.name}</p>
              <p className="text-xs text-muted-foreground">
                {rate != null
                  ? `${formatVES(eurCentsToVES(line.unitPriceCents, rate))} / ${formatEUR(line.unitPriceCents)} c/u`
                  : `${formatEUR(line.unitPriceCents)} c/u`}
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
              <Price eurCents={line.unitPriceCents * line.quantity} rate={rate} />
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
        <Price eurCents={total} rate={rate} size="lg" className="items-end" />
      </div>

      <div className="flex gap-2">
        {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
          <Button
            key={method}
            type="button"
            size="sm"
            variant={paymentMethod === method ? "default" : "outline"}
            onClick={() => onPaymentMethodChange(method)}
            className="flex-1"
          >
            {PAYMENT_METHOD_LABELS[method]}
          </Button>
        ))}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={!paidInForeignCurrency ? "default" : "outline"}
          onClick={() => onPaidInForeignCurrencyChange(false)}
          className="flex-1"
        >
          Bolívares
        </Button>
        <Button
          type="button"
          size="sm"
          variant={paidInForeignCurrency ? "default" : "outline"}
          onClick={() => onPaidInForeignCurrencyChange(true)}
          className="flex-1"
        >
          Divisas (USD/EUR)
        </Button>
      </div>

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

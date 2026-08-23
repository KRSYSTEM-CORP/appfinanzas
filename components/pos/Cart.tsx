"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { PaymentSplitBuilder, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { PAYMENT_STATUS_LABELS } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { computeItemDiscountCents } from "@/lib/discount";
import { resolveTierPrice, PRICE_TIER_LABELS, type PriceTier, type TieredProduct } from "@/lib/pricing";
import type { PaymentStatus, ReferenceCurrency } from "@prisma/client";

export type CartLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  maxStock: number;
  // Only present (and only meaningful) when the product has quantity-based
  // pricing configured — see lib/pricing.ts. priceTierOverride is the
  // seller's manual pick; null means auto-detect from quantity.
  product: TieredProduct;
  priceTierOverride: PriceTier | null;
};

const PRICE_TIER_ORDER: PriceTier[] = ["RETAIL", "WHOLESALE", "BULK"];

// Segmented Detal/Mayor/Gran mayor picker shown under a line when its
// product has price tiers enabled — only lists tiers the product actually
// has configured. Highlights whichever tier is actually in effect right now
// (the auto-detected one when there's no override) so the seller can see at
// a glance why the price is what it is.
function PriceTierPicker({
  product,
  quantity,
  override,
  onChange,
}: {
  product: TieredProduct;
  quantity: number;
  override: PriceTier | null;
  onChange: (tier: PriceTier | null) => void;
}) {
  const auto = resolveTierPrice(product, quantity);
  const active = override ?? auto.tier;
  const available = PRICE_TIER_ORDER.filter((tier) => {
    if (tier === "RETAIL") return true;
    if (tier === "WHOLESALE") return product.wholesalePriceCents != null;
    return product.bulkPriceCents != null;
  });
  if (available.length <= 1) return null;

  return (
    <div className="flex items-center gap-1">
      {available.map((tier) => (
        <button
          key={tier}
          type="button"
          onClick={() => onChange(tier === auto.tier ? null : tier)}
          title={tier === auto.tier && !override ? "Automático según la cantidad" : undefined}
          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
            active === tier
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/70"
          }`}
        >
          {PRICE_TIER_LABELS[tier]}
        </button>
      ))}
    </div>
  );
}

// Lets the cashier type a quantity directly instead of only tapping −/+ —
// much faster for a bulk sale. Keeps its own draft string so the field can
// be freely edited (including briefly empty) while typing; only commits
// (clamped to [1, maxStock]) on blur/Enter, reverting to the last valid
// quantity if what's typed doesn't parse.
function QuantityInput({
  quantity,
  maxStock,
  onCommit,
}: {
  quantity: number;
  maxStock: number;
  onCommit: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  function commit() {
    const parsed = Math.floor(Number(draft));
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(parsed, maxStock);
      setDraft(String(clamped));
      if (clamped !== quantity) onCommit(clamped);
    } else {
      setDraft(String(quantity));
    }
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={maxStock}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className="w-12 rounded border border-input bg-background px-1 py-0.5 text-center text-sm tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

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
  onSetQuantity,
  onSetPriceTier,
  onRemove,
  note,
  onNoteChange,
  discountPercent,
  onDiscountPercentChange,
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
  onSetQuantity: (productId: string, quantity: number) => void;
  onSetPriceTier: (productId: string, tier: PriceTier | null) => void;
  onRemove: (productId: string) => void;
  note: string;
  onNoteChange: (note: string) => void;
  discountPercent: string;
  onDiscountPercentChange: (value: string) => void;
  onCheckout: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const rawTotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  // Same per-line rounding the server applies in completeSale, so this
  // preview always matches the total that's actually validated at checkout.
  const discountValue = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountCents = lines.reduce(
    (sum, l) => sum + computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
    0
  );
  const total = rawTotal - discountCents;

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
              {line.product.priceTiersEnabled && (
                <div className="mt-1">
                  <PriceTierPicker
                    product={line.product}
                    quantity={line.quantity}
                    override={line.priceTierOverride}
                    onChange={(tier) => onSetPriceTier(line.productId, tier)}
                  />
                </div>
              )}
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
              <QuantityInput
                quantity={line.quantity}
                maxStock={line.maxStock}
                onCommit={(quantity) => onSetQuantity(line.productId, quantity)}
              />
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

      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="sale-discount" className="text-sm text-muted-foreground shrink-0">
          Descuento (%)
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id="sale-discount"
            type="number"
            min="0"
            max="100"
            step="1"
            value={discountPercent}
            onChange={(e) => onDiscountPercentChange(e.target.value)}
            className="w-20 h-8 text-sm text-right"
            placeholder="0"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDiscountPercentChange("100")}
          >
            Exonerar
          </Button>
        </div>
      </div>

      {discountValue > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <Price
            eurCents={rawTotal}
            rate={rate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
          />
        </div>
      )}
      {discountValue > 0 && (
        <div className="flex items-center justify-between text-sm text-destructive">
          <span>Descuento ({discountValue}%)</span>
          <span>
            −
            <Price
              eurCents={discountCents}
              rate={rate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              className="inline-flex"
            />
          </span>
        </div>
      )}

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

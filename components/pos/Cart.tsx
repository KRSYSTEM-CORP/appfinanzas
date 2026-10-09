"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { QuantityInput } from "@/components/shared/QuantityInput";
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
  // A 100%-discounted sale has nothing to collect — asking the cashier to
  // still pick "Pagada"/"A crédito" and a payment method for Bs. 0,00 is
  // just friction, and the server already accepts paymentStatus "PAID"
  // with no payment rows for a zero total (see completeSale).
  const isExonerated = total <= 0 && lines.length > 0;
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);

  // Phones: the cart is a bottom sheet opened from a bar showing the total.
  // From md up the very same element is the inline column next to the catalog,
  // so there is a single cart instance (and a single set of inputs) either way.
  const [sheetOpen, setSheetOpen] = useState(false);
  const open = sheetOpen && lines.length > 0;
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  // Lock page scroll behind the sheet (phones only).
  useEffect(() => {
    if (!open || !window.matchMedia("(max-width: 767px)").matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Drag the grip row down to dismiss: the sheet follows the finger 1:1 and a
  // quick flick closes it even when it did not travel far.
  function dragStart(e: ReactPointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button")) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is only an optimisation; dragging still works without it.
    }
    drag.current = { startY: e.clientY, startT: e.timeStamp, dy: 0 };
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }
  function dragMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${d.dy}px)`;
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, 1 - d.dy / 400));
  }
  function dragEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const velocity = d.dy / Math.max(1, e.timeStamp - d.startT);
    const dismiss = d.dy > 120 || (d.dy > 24 && velocity > 0.5);
    if (sheetRef.current) {
      sheetRef.current.style.transition = "";
      sheetRef.current.style.transform = "";
    }
    if (scrimRef.current) scrimRef.current.style.opacity = "";
    if (dismiss) setSheetOpen(false);
  }

  return (
    <>
    {/* Phones only: scrim behind the sheet. */}
    {open && (
      <div
        ref={scrimRef}
        className="sheet-fade md:hidden fixed inset-0 z-[44] bg-black/40"
        onClick={() => setSheetOpen(false)}
        aria-hidden="true"
      />
    )}
    <div
      ref={sheetRef}
      role={open ? "dialog" : undefined}
      aria-label={open ? "Carrito" : undefined}
      className={`flex flex-col h-full gap-3 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-[45] max-md:h-auto max-md:max-h-[88dvh] max-md:overflow-y-auto max-md:rounded-t-2xl max-md:border-t max-md:bg-popover max-md:text-popover-foreground max-md:px-4 max-md:pt-2 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:shadow-2xl max-md:transition-transform max-md:duration-[260ms] max-md:ease-[cubic-bezier(.23,1,.32,1)] motion-reduce:max-md:transition-none ${
        open ? "max-md:translate-y-0" : "max-md:translate-y-full max-md:invisible"
      }`}
    >
      <div
        className="md:hidden flex touch-none items-center justify-between pt-1"
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={dragEnd}
        onPointerCancel={dragEnd}
      >
        <span className="h-1.5 w-10 rounded-full bg-muted-foreground/25" aria-hidden="true" />
        <button
          type="button"
          onClick={() => setSheetOpen(false)}
          aria-label="Cerrar carrito"
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
        >
          <XIcon className="size-5" />
        </button>
      </div>
      <h2 className="font-semibold">Carrito</h2>

      <div className="md:flex-1 md:overflow-y-auto flex flex-col gap-2">
        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Agrega productos para empezar una venta.
          </p>
        )}
        {lines.map((line) => (
          <div
            key={line.productId}
            className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-dashed border-border pb-3 last:border-b-0 md:flex-nowrap md:justify-between md:pb-2"
          >
            {/* Phones: name + remove on the first row, quantity + subtotal on the
                second (a single row left the name truncated to a few letters). */}
            <div className="order-1 min-w-0 flex-[1_1_calc(100%_-_3.5rem)] md:flex-1 md:basis-auto">
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
            <div className="order-3 flex items-center gap-1 md:order-2">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                className="max-md:size-11"
                aria-label="Quitar una unidad"
                onClick={() => onDecrement(line.productId)}
              >
                <MinusIcon />
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
                className="max-md:size-11"
                aria-label="Agregar una unidad"
                disabled={line.quantity >= line.maxStock}
                onClick={() => onIncrement(line.productId)}
              >
                <PlusIcon />
              </Button>
            </div>
            <div className="order-4 ml-auto text-right md:order-3 md:ml-0 md:w-28">
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
              size="icon-sm"
              variant="ghost"
              className="order-2 max-md:size-11 md:order-4"
              aria-label={`Quitar ${line.name} del carrito`}
              onClick={() => onRemove(line.productId)}
            >
              <XIcon />
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
        <Textarea id="sale-note" value={note} onChange={(e) => onNoteChange(e.target.value)} rows={2} />
        <p className="text-xs text-muted-foreground">Se imprime en la nota de entrega y la factura</p>
      </div>

      {isExonerated ? (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">
          Venta exonerada (100% de descuento) — no se requiere método de pago.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((status) => (
              <Button
                key={status}
                type="button"
                size="sm"
                variant={paymentStatus === status ? "default" : "outline"}
                onClick={() => onPaymentStatusChange(status)}
                className="min-h-11 flex-1"
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
        </>
      )}

      <div className="flex flex-col gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          size="lg"
          disabled={lines.length === 0}
          loading={isPending}
          onClick={onCheckout}
        >
          {isPending ? "Procesando..." : "Completar venta"}
        </Button>
      </div>

    </div>

      {/* Phones only: the total and the way into the cart sheet stay in reach
          while browsing the catalog. */}
      {lines.length > 0 && !open && (
        <div className="md:hidden fixed left-0 right-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 border-t glass-bar px-4 py-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-xs text-muted-foreground">
              {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
            </span>
            <Price
              eurCents={total}
              rate={rate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              size="lg"
            />
          </div>
          <Button type="button" size="lg" className="shrink-0" onClick={() => setSheetOpen(true)}>
            Ver carrito
          </Button>
        </div>
      )}
    </>
  );
}

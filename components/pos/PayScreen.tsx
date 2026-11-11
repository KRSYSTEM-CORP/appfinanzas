"use client";

import { ArrowLeftIcon, BanknoteIcon, CreditCardIcon, LandmarkIcon, SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Price } from "@/components/money/Price";
import { PaymentAccountsList } from "@/components/payments/PaymentAccountsList";
import {
  PaymentSplitBuilder,
  paymentSplitRowsTotalCents,
  type PaymentSplitRow,
} from "@/components/payments/PaymentSplitBuilder";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";
import { eurCentsToLocal, formatCurrencyCents } from "@/lib/currencies";
import { resolvePaymentCurrency } from "@/lib/payment-currency";
import { bankLogoSrc } from "@/lib/payment-accounts";
import type { PaymentMethod, PaymentStatus, ReferenceCurrency } from "@prisma/client";

type MethodOption = {
  id: string;
  label: string;
  method: PaymentMethod;
  foreign: boolean;
  logo?: string;
  icon?: React.ReactNode;
};

const METHOD_OPTIONS: MethodOption[] = [
  { id: "cash-local", label: "Efectivo Bs", method: "CASH", foreign: false, icon: <BanknoteIcon className="size-6" /> },
  { id: "cash-foreign", label: "Efectivo $", method: "CASH", foreign: true, icon: <BanknoteIcon className="size-6" /> },
  { id: "card", label: "Pago Móvil", method: "CARD", foreign: false, icon: <SmartphoneIcon className="size-6" /> },
  { id: "pos", label: "Punto de venta", method: "POS", foreign: false, icon: <CreditCardIcon className="size-6" /> },
  { id: "transfer", label: "Transferencia", method: "TRANSFER", foreign: false, icon: <LandmarkIcon className="size-6" /> },
  { id: "zelle", label: "Zelle", method: "ZELLE", foreign: false, logo: bankLogoSrc("zelle") ?? undefined },
  { id: "binance", label: "Binance", method: "BINANCE", foreign: false, logo: bankLogoSrc("binance") ?? undefined },
  { id: "paypal", label: "PayPal", method: "PAYPAL", foreign: false, logo: bankLogoSrc("paypal") ?? undefined },
];

const DISCOUNT_CHIPS = [0, 5, 10, 15];

export function PayScreen({
  customerName,
  rawTotal,
  total,
  discountPercent,
  onDiscountPercentChange,
  paymentStatus,
  onPaymentStatusChange,
  paymentRows,
  onPaymentRowsChange,
  note,
  onNoteChange,
  paymentAccounts,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  igtfRatePercent,
  isGeneralCustomer,
  topMethod,
  isPending,
  error,
  onBack,
  onConfirm,
}: {
  customerName: string;
  rawTotal: number;
  total: number;
  discountPercent: string;
  onDiscountPercentChange: (v: string) => void;
  paymentStatus: PaymentStatus;
  onPaymentStatusChange: (s: PaymentStatus) => void;
  paymentRows: PaymentSplitRow[];
  onPaymentRowsChange: (rows: PaymentSplitRow[]) => void;
  note: string;
  onNoteChange: (v: string) => void;
  paymentAccounts: PaymentAccountRow[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  igtfRatePercent: number | null;
  isGeneralCustomer: boolean;
  // Método más usado hoy (de la tarjeta de resumen del día), si lo hay.
  topMethod: PaymentMethod | null;
  isPending: boolean;
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const discountValue = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const exonerated = total <= 0;
  const fractional = paymentStatus === "PAID" && paymentRows.length > 1;
  const mode: "full" | "split" | "credit" = paymentStatus === "CREDIT" ? "credit" : fractional ? "split" : "full";
  const assigned = paymentSplitRowsTotalCents(paymentRows, currencyCode, rate, exchangeRateEnabled, referenceCurrency);
  const pending = Math.max(0, total - assigned);
  const progress = total > 0 ? Math.min(100, Math.round((assigned / total) * 100)) : 100;

  function amountFor(opt: MethodOption, refCents: number): string {
    const cur = resolvePaymentCurrency(opt.method, opt.foreign, currencyCode, exchangeRateEnabled, referenceCurrency);
    const value = cur === "USD" || cur === referenceCurrency || rate == null ? refCents / 100 : eurCentsToLocal(refCents, rate);
    return value.toFixed(2);
  }

  function newRow(opt: MethodOption, refCents: number): PaymentSplitRow {
    return { paymentMethod: opt.method, amount: amountFor(opt, refCents), paidInForeignCurrency: opt.foreign, reference: "" };
  }

  function pickMethod(opt: MethodOption) {
    if (mode === "split") {
      onPaymentRowsChange([...paymentRows, newRow(opt, pending)]);
    } else {
      onPaymentStatusChange("PAID");
      onPaymentRowsChange([newRow(opt, total)]);
    }
  }

  function setMode(next: "full" | "split" | "credit") {
    if (next === "credit") {
      onPaymentStatusChange("CREDIT");
      return;
    }
    onPaymentStatusChange("PAID");
    if (next === "full") onPaymentRowsChange(paymentRows.slice(0, 1).map((r) => ({ ...r, amount: amountFor({ id: "", label: "", method: r.paymentMethod, foreign: r.paidInForeignCurrency }, total) })));
    else if (paymentRows.length < 2) {
      const half = Math.round(total / 2);
      const first = paymentRows[0] ?? newRow(METHOD_OPTIONS[0], half);
      onPaymentRowsChange([
        { ...first, amount: amountFor({ id: "", label: "", method: first.paymentMethod, foreign: first.paidInForeignCurrency }, half) },
        newRow(METHOD_OPTIONS[2], total - half),
      ]);
    }
  }

  const activeIds = new Set(
    paymentRows.map((r) => METHOD_OPTIONS.find((o) => o.method === r.paymentMethod && (r.paymentMethod !== "CASH" || o.foreign === r.paidInForeignCurrency))?.id)
  );
  const canConfirm = !isPending && (exonerated || mode === "credit" ? !(mode === "credit" && isGeneralCustomer) : pending === 0 || Math.abs(pending) <= 2);
  const igtfCents =
    paymentStatus === "PAID" && igtfRatePercent != null
      ? Math.round(
          (paymentRows
            .filter((r) => resolvePaymentCurrency(r.paymentMethod, r.paidInForeignCurrency, currencyCode, exchangeRateEnabled, referenceCurrency) !== currencyCode)
            .reduce((s, r) => s + Math.round((Number(r.amount.replace(",", ".")) || 0) * 100), 0) *
            igtfRatePercent) /
            100
        )
      : 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-[22px] bg-card p-5 shadow-(--shadow-card)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Volver a la venta
        </button>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total a cobrar</p>
          <Price eurCents={total} rate={rate} currencyCode={currencyCode} exchangeRateEnabled={exchangeRateEnabled} referenceCurrency={referenceCurrency} size="lg" className="items-end" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div role="tablist" aria-label="Forma de pago" className="grid grid-cols-3 gap-2">
            {([
              ["full", "Completo"],
              ["split", "Fraccionado"],
              ["credit", "A crédito"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                disabled={exonerated}
                onClick={() => setMode(id)}
                className={`min-h-11 rounded-xl border-2 text-sm font-bold transition-colors disabled:opacity-50 ${
                  mode === id ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted hover:bg-muted/70"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {exonerated ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Venta exonerada (100 % de descuento): no se requiere método de pago.</p>
          ) : mode === "credit" ? (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {isGeneralCustomer ? (
                <p className="font-semibold text-destructive">La venta a crédito necesita un cliente registrado. Vuelve y registra o elige uno del Directorio.</p>
              ) : (
                <p>Esta venta quedará pendiente de cobro a nombre de {customerName}. El método de pago se registra cuando pague, desde Reportes.</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {mode === "split" ? "Agregar otro método" : "Método de pago"}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {METHOD_OPTIONS.filter((o) => exchangeRateEnabled || !o.foreign || o.id === "cash-foreign").map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => pickMethod(o)}
                      aria-pressed={mode === "full" && activeIds.has(o.id)}
                      className={`relative flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 p-3 text-center text-[13px] font-bold transition-colors ${
                        mode === "full" && activeIds.has(o.id) ? "border-primary bg-primary/10 text-primary" : "border-transparent bg-muted hover:bg-muted/70"
                      }`}
                    >
                      {o.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={o.logo} alt="" className="h-8 w-auto max-w-[72px] rounded object-contain" />
                      ) : (
                        o.icon
                      )}
                      {o.label}
                      {topMethod === o.method && (
                        <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">Más usado hoy</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <PaymentSplitBuilder
                rows={paymentRows}
                onChange={onPaymentRowsChange}
                totalCents={total}
                rate={rate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
                idPrefix="pay"
              />
              {igtfCents > 0 && (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  IGTF ({igtfRatePercent}%) a cobrar aparte por el pago en divisas:{" "}
                  <span className="font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, igtfCents)}</span>
                </p>
              )}
              {paymentAccounts.length > 0 && (
                <details className="rounded-xl border bg-card p-3" open>
                  <summary className="cursor-pointer text-sm font-semibold">Datos para cobrar ({paymentAccounts.length})</summary>
                  <div className="mt-2">
                    <PaymentAccountsList accounts={paymentAccounts} />
                  </div>
                </details>
              )}
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <div className="rounded-2xl bg-muted p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cliente de esta venta</p>
            <p className="truncate font-semibold">{customerName}</p>
          </div>

          {!exonerated && mode !== "credit" && (
            <div className="rounded-2xl bg-muted p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Saldo pendiente</p>
              <Price eurCents={pending} rate={rate} currencyCode={currencyCode} exchangeRateEnabled={exchangeRateEnabled} referenceCurrency={referenceCurrency} size="lg" />
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {pending === 0 ? "Pago completo" : `Falta ${progress < 100 ? 100 - progress : 0} % por cobrar`}
              </p>
            </div>
          )}

          <div className="rounded-2xl bg-muted p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Descuento</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DISCOUNT_CHIPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDiscountPercentChange(String(d))}
                  className={`min-h-9 rounded-lg border-2 px-3 text-xs font-bold ${discountValue === d ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-background"}`}
                >
                  {d === 0 ? "Ninguno" : `${d} %`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => onDiscountPercentChange("100")}
                className={`min-h-9 rounded-lg border-2 px-3 text-xs font-bold ${discountValue === 100 ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-background"}`}
              >
                Exonerada
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Label htmlFor="pay-discount" className="shrink-0 text-xs text-muted-foreground">Otro descuento (%)</Label>
              <Input id="pay-discount" type="number" min="0" max="100" step="1" value={discountPercent} onChange={(e) => onDiscountPercentChange(e.target.value)} className="h-8 w-20 text-right text-sm" />
            </div>
            {discountValue > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Subtotal {formatCurrencyCents(referenceCurrency, rawTotal)} · descuento {discountValue} %
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-muted p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Documento</p>
            <p className="text-sm font-semibold">Nota de entrega</p>
            <p className="text-xs text-muted-foreground">Podrás emitir la factura al terminar la venta.</p>
            <Label htmlFor="pay-note" className="mt-2 block text-xs text-muted-foreground">Nota (opcional)</Label>
            <Textarea id="pay-note" value={note} onChange={(e) => onNoteChange(e.target.value)} rows={2} className="mt-1" />
          </div>
        </aside>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t pt-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Estado tras este cobro:{" "}
            <strong className="text-foreground">{exonerated ? "Exonerada" : mode === "credit" ? "A crédito" : pending === 0 ? "Pagada" : "Falta cobrar"}</strong>
          </p>
          <Button type="button" size="lg" disabled={!canConfirm} loading={isPending} onClick={onConfirm}>
            {isPending ? "Procesando..." : "Confirmar cobro"}
          </Button>
        </div>
      </div>
    </div>
  );
}

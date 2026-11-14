"use client";

import { useState, useTransition } from "react";
import {
  BanknoteIcon,
  CheckIcon,
  ChevronLeftIcon,
  CopyIcon,
  CreditCardIcon,
  LandmarkIcon,
  LockIcon,
  PlusIcon,
  SmartphoneIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { validateCoupon } from "@/lib/actions/marketing";
import { normalizePromoCode } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Chip } from "@/components/ui/chip";
import { WhatsappIcon } from "@/components/ui/whatsapp-icon";
import { CustomerDisplay } from "@/components/pos/CustomerDisplay";
import type { PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { ACCOUNT_KIND_LABELS, accountClipboardText, bankLabel, bankLogoSrc, defaultBankKey } from "@/lib/payment-accounts";
import {
  amountToRefCents,
  billValues,
  buildLine,
  changeDue,
  currencyCaption,
  currencyWord,
  discountPercentFromAmount,
  formatAmount,
  igtfCents as computeIgtf,
  isCashMethod,
  methodCurrency,
  methodIdFor,
  parseAmount,
  paySummary,
  posMethod,
  refCentsToAmount,
  requiresReference,
  toPaymentRows,
  visibleMethods,
  type CurrencyCtx,
  type PayLine,
  type PayMode,
  type PosMethodId,
} from "@/lib/pos/checkout";
import type { PaymentMethod, PaymentStatus, ReferenceCurrency } from "@prisma/client";

export type DocumentKind = "delivery" | "ticket";

export type PayConfirm = {
  paymentStatus: PaymentStatus;
  rows: PaymentSplitRow[];
  extraNote?: string;
  // Vuelto entregado en efectivo, ya formateado ("$46,00"), o null.
  change: string | null;
};

const CARD = "rounded-[19px] bg-card p-4 shadow-(--shadow-card) min-w-0";
const FIELD_INPUT =
  "h-11 w-full rounded-[12px] border border-border bg-background px-3 text-[13px] font-semibold text-foreground outline-none placeholder:font-semibold placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/30";

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-3 flex items-start justify-between gap-2.5">
      <div className="min-w-0">
        <h3 className="text-base font-bold tracking-[-0.015em]">{title}</h3>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
    </header>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-2.5 flex flex-col gap-1 text-[13px] font-semibold first:mt-0">
      {label}
      {children}
    </label>
  );
}

function MethodIcon({ id }: { id: PosMethodId }) {
  const logo = id === "zl" ? bankLogoSrc("zelle") : id === "bn" ? bankLogoSrc("binance") : id === "pp" ? bankLogoSrc("paypal") : null;
  if (logo) {
    return (
      <span className="mb-1 grid size-[38px] place-items-center overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" className="block max-h-[78%] max-w-[78%] object-contain" />
      </span>
    );
  }
  const Icon = id === "pm" ? SmartphoneIcon : id === "pv" ? CreditCardIcon : id === "tr" ? LandmarkIcon : BanknoteIcon;
  return (
    <span className="mb-1 grid size-[38px] place-items-center rounded-[12px] bg-card text-primary">
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

// Interruptor de la preview (.sw): pista de 44×26, perilla blanca de 20px.
function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} className="inline-flex items-center py-1">
      <i
        className={cn(
          "relative h-[26px] w-11 flex-none rounded-full transition-colors duration-150",
          on ? "bg-(--m-caja)" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] left-[3px] size-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-transform duration-150",
            on && "translate-x-[18px]"
          )}
        />
      </i>
    </button>
  );
}

export function PayScreen({
  customerName,
  customerPhone,
  rawTotal,
  total,
  discountPercent,
  onDiscountPercentChange,
  couponCode,
  onCouponApplied,
  onCouponRemoved,
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
  documentKind,
  onDocumentKindChange,
  onBack,
  onPickCustomer,
  onConfirm,
}: {
  customerName: string;
  customerPhone: string | null;
  rawTotal: number;
  total: number;
  discountPercent: string;
  onDiscountPercentChange: (v: string) => void;
  // Cupón de descuento canjeado (código) y sus callbacks.
  couponCode: string | null;
  onCouponApplied: (code: string, percent: number) => void;
  onCouponRemoved: () => void;
  paymentAccounts: PaymentAccountRow[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  igtfRatePercent: number | null;
  isGeneralCustomer: boolean;
  // Método de pago más usado hoy (resumen del día), si lo hay.
  topMethod: PaymentMethod | null;
  isPending: boolean;
  error: string | null;
  documentKind: DocumentKind;
  onDocumentKindChange: (k: DocumentKind) => void;
  onBack: () => void;
  // «Elegir cliente» (venta a crédito con el cliente general).
  onPickCustomer: () => void;
  onConfirm: (r: PayConfirm) => void;
}) {
  const ctx: CurrencyCtx = { currencyCode, rate, exchangeRateEnabled, referenceCurrency };
  const [mode, setModeState] = useState<PayMode>("full");
  const [sel, setSel] = useState<PosMethodId | null>(null);
  const [amt, setAmt] = useState("");
  const [recv, setRecv] = useState("");
  const [ref, setRef] = useState("");
  const [lines, setLines] = useState<PayLine[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [discType, setDiscType] = useState<"%" | "$">("%");
  const [discText, setDiscText] = useState("");
  const [reason, setReason] = useState("");
  const [beforeExo, setBeforeExo] = useState("0");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [couponText, setCouponText] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, startCoupon] = useTransition();

  function redeemCoupon() {
    setCouponError(null);
    if (isGeneralCustomer) {
      setCouponError("Selecciona un cliente (nombre y apellido) para canjear el cupón");
      return;
    }
    if (!navigator.onLine) {
      setCouponError("Sin conexión: el cupón se valida con el servidor");
      return;
    }
    startCoupon(async () => {
      const r = await validateCoupon(couponText, customerPhone);
      if (!r.success) {
        setCouponError(r.error);
        return;
      }
      setDiscType("%");
      setDiscText("");
      setCouponText("");
      onCouponApplied(r.code, r.discountPercent);
    });
  }

  const discountValue = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const exo = discountValue >= 100;
  const debt = mode === "debt";
  const sum = paySummary(mode, sel, lines, total);
  const igtf = exo ? 0 : computeIgtf(mode, sel, lines, total, igtfRatePercent, ctx);
  const igtfLabel = igtfRatePercent != null ? `IGTF ${String(igtfRatePercent).replace(".", ",")} %` : "IGTF";
  const methods = visibleMethods(exchangeRateEnabled);
  const topId = methodIdFor(topMethod, exchangeRateEnabled);
  const selM = sel ? posMethod(sel) : null;
  const selCur = selM ? methodCurrency(selM, ctx) : null;
  const defAmount = selM && selCur ? refCentsToAmount(sum.remainingCents, selCur, ctx) : 0;
  const amountText = amt !== "" ? amt : formatAmount(defAmount);

  const fmtRef = (cents: number) => formatCurrencyCents(referenceCurrency, cents);
  const fmtLocal = (cents: number) =>
    exchangeRateEnabled && rate != null ? formatLocalCurrency(eurCentsToLocal(cents, rate), currencyCode) : null;
  const fmtIn = (amount: number, cur: string) =>
    cur === "USD" || cur === "EUR" ? formatCurrencyCents(cur, Math.round(amount * 100)) : formatLocalCurrency(amount, cur);

  function setMode(next: PayMode) {
    setModeState(next);
    setLines([]);
    setSel(null);
    setAmt("");
    setLocalError(null);
  }

  function pickMethod(id: PosMethodId) {
    setSel(id);
    setAmt("");
    setRecv("");
    setRef("");
    setLocalError(null);
    if (mode === "full") setLines([]);
  }

  function addLine() {
    if (!sel) return;
    if (requiresReference(sel) && !ref.trim()) {
      setLocalError("El número de referencia es obligatorio para este método de pago");
      return;
    }
    const line = buildLine(sel, amt, ref, sum.remainingCents, ctx);
    if (!line) {
      setLocalError("Escribe un monto");
      return;
    }
    setLines([...lines, line]);
    setSel(null);
    setAmt("");
    setRef("");
    setRecv("");
    setLocalError(null);
  }

  function setPercent(v: number) {
    setDiscType("%");
    setDiscText("");
    onDiscountPercentChange(String(v));
  }

  function onDiscText(text: string, type: "%" | "$" = discType) {
    setDiscText(text);
    const n = parseAmount(text);
    const pct = type === "%" ? Math.min(100, Math.max(0, n)) : discountPercentFromAmount(Math.round(n * 100), rawTotal);
    onDiscountPercentChange(String(pct));
  }

  function toggleExo() {
    if (exo) onDiscountPercentChange(beforeExo);
    else {
      setBeforeExo(discountPercent);
      onDiscountPercentChange("100");
    }
  }

  async function copyAccount(a: PaymentAccountRow) {
    try {
      await navigator.clipboard.writeText(accountClipboardText(a));
      setCopiedId(a.id);
      setTimeout(() => setCopiedId((c) => (c === a.id ? null : c)), 1800);
    } catch {
      // Sin permiso de portapapeles: los datos siguen a la vista.
    }
  }

  function sendAccount(a: PaymentAccountRow) {
    const digits = !isGeneralCustomer && customerPhone ? customerPhone.replace(/\D/g, "") : "";
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(accountClipboardText(a))}`, "_blank", "noopener");
  }

  function confirm() {
    setLocalError(null);
    if (exo) {
      if (reason.trim().length < 3) {
        setLocalError("Escribe el motivo de la exoneración");
        return;
      }
      onConfirm({ paymentStatus: "PAID", rows: [], extraNote: `Exonerada: ${reason.trim()}`, change: null });
      return;
    }
    if (debt) {
      if (isGeneralCustomer) return;
      onConfirm({ paymentStatus: "CREDIT", rows: [], change: null });
      return;
    }
    let all = lines;
    let change: string | null = null;
    if (mode === "full" && lines.length === 0 && sel) {
      if (requiresReference(sel) && !ref.trim()) {
        setLocalError("El número de referencia es obligatorio para este método de pago");
        return;
      }
      const line = buildLine(sel, amt, ref, total, ctx);
      if (!line) {
        setLocalError("Escribe un monto");
        return;
      }
      all = [line];
      if (isCashMethod(sel) && recv.trim() && selCur) {
        const v = changeDue(line.amount, parseAmount(recv));
        if (v > 0) change = fmtIn(v, selCur);
      }
    }
    const missing = total - all.reduce((s, l) => s + l.refCents, 0);
    if (missing > 0 || all.length === 0) {
      setLocalError(`Falta cubrir ${fmtRef(Math.max(missing, 0))}`);
      return;
    }
    if (missing < -all.length) {
      setLocalError(`Los pagos superan el total por ${fmtRef(-missing)}: quita uno y agrégalo de nuevo`);
      return;
    }
    onConfirm({ paymentStatus: "PAID", rows: toPaymentRows(all), change });
  }

  const status = exo
    ? "✓ Exonerada · sin cobro"
    : debt
      ? "Queda en Cuentas por cobrar"
      : sum.done
        ? "✓ Cierra y salda la cuenta"
        : `Falta ${fmtRef(sum.saldoCents)}`;
  const cta = exo ? "Registrar exonerada" : debt ? `Vender a crédito · ${fmtRef(sum.saldoCents || total)}` : `Cobrar ${fmtRef(total + igtf)}`;
  const ctaDisabled = isPending || (exo ? false : debt ? isGeneralCustomer : !sum.done);
  const accounts = selM?.accountKind ? paymentAccounts.filter((a) => a.kind === selM.accountKind) : [];
  const vuelto = (() => {
    if (!selCur) return null;
    const rc = parseAmount(recv);
    if (!rc) return <span className="text-sm text-muted-foreground">Escribe lo que entrega el cliente para calcular el vuelto</span>;
    const v = changeDue(parseAmount(amountText), rc);
    return v >= 0 ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/14 px-2.5 py-[3px] text-xs font-semibold text-success">
        Vuelto: <b>{fmtIn(v, selCur)}</b>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/12 px-2.5 py-[3px] text-xs font-semibold text-destructive">
        Faltan {fmtIn(-v, selCur)}
      </span>
    );
  })();
  const selIgtf =
    selM && selCur && selCur !== currencyCode && igtfRatePercent != null
      ? Math.round((amountToRefCents(parseAmount(amountText), selCur, ctx) * igtfRatePercent) / 100)
      : null;
  const msg = localError ?? error;

  return (
    <div className="flex flex-col gap-3.5 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] md:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onBack}>
          <ChevronLeftIcon className="size-4" strokeWidth={2.4} /> Volver a la venta
        </Button>
        <span className="flex-1" />
        <CustomerDisplay
          totalCents={total}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          accounts={paymentAccounts}
        />
      </div>

      <div className="grid items-start gap-3.5 md:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <section className={cn(CARD, "p-2")}>
            <Segmented
              label="Forma de pago"
              value={mode}
              onChange={setMode}
              className="grid w-full grid-cols-3 [&>button]:px-1.5"
              options={[
                { value: "full", label: "Completo" },
                { value: "split", label: "Fraccionado" },
                { value: "debt", label: "A crédito" },
              ]}
            />
          </section>

          {exo ? (
            <section className={CARD}>
              <h3 className="text-base font-bold tracking-[-0.015em]">Venta exonerada</h3>
              <p className="mt-1 text-muted-foreground">
                El total es {fmtRef(0)}: no hace falta elegir método de pago. Queda registrada a nombre de{" "}
                <b className="text-foreground">{customerName}</b>.
              </p>
            </section>
          ) : debt ? (
            <section className={CARD}>
              <h3 className="text-base font-bold tracking-[-0.015em]">Vender a crédito</h3>
              <p className="mt-1 mb-2.5 text-muted-foreground">
                El saldo pasa a Cuentas por cobrar del cliente.{" "}
                {isGeneralCustomer ? (
                  <b className="text-destructive">El cliente general no puede comprar a crédito: elige un cliente registrado.</b>
                ) : (
                  <>
                    Cliente: <b className="text-foreground">{customerName}</b>.
                  </>
                )}
              </p>
              {isGeneralCustomer && (
                <Button type="button" onClick={onPickCustomer}>
                  <UserIcon className="size-4" /> Elegir cliente
                </Button>
              )}
            </section>
          ) : (
            <>
              <section className={CARD}>
                <CardHeader title="Método de pago" subtitle="Bolívares se cobran en Bs; divisas en $ con su referencia en Bs" />
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-2.5">
                  {methods.map((m) => {
                    const on = sel === m.id;
                    const used = lines.some((l) => l.id === m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => pickMethod(m.id)}
                        className={cn(
                          "relative flex flex-col items-center gap-0.5 rounded-[18px] border-2 px-2 py-3.5 text-center transition-[border-color,background-color,transform] duration-150 active:scale-[0.97]",
                          on ? "border-primary bg-primary/12" : "border-transparent bg-muted"
                        )}
                      >
                        <MethodIcon id={m.id} />
                        <b className="text-sm font-bold">{m.label}</b>
                        <small className="text-xs text-muted-foreground">{currencyCaption(methodCurrency(m, ctx))}</small>
                        {topId === m.id && (
                          <em className="absolute -top-2 rounded-full bg-(--m-caja) px-2 py-0.5 text-[10px] font-extrabold not-italic text-foreground">
                            Más usado hoy
                          </em>
                        )}
                        {used && (
                          <span className="absolute top-2 right-2 grid size-[22px] place-items-center rounded-full bg-(--m-caja) text-white">
                            <CheckIcon className="size-[13px]" strokeWidth={3} aria-hidden />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              {selM && selCur && accounts.length > 0 && (
                <section className={CARD}>
                  <CardHeader
                    title="Datos para cobrar"
                    subtitle={`Dicta o envía estos datos al cliente · ${accounts.length} cuenta${accounts.length > 1 ? "s" : ""} de ${selM.label}`}
                  />
                  <div className="flex flex-col gap-3">
                    {accounts.map((a) => {
                      const name = a.bankName ?? bankLabel(a.bankKey) ?? ACCOUNT_KIND_LABELS[a.kind];
                      const logo = bankLogoSrc(a.bankKey ?? defaultBankKey(a.kind));
                      const rows: [string, string | null][] =
                        a.kind === "PAGO_MOVIL"
                          ? [["Banco", name], ["Teléfono", a.accountNumber], ["Cédula / RIF", a.docId]]
                          : a.kind === "TRANSFER"
                            ? [["Banco", name], ["Cuenta", a.accountNumber], ["Titular", a.holder], ["RIF", a.docId]]
                            : a.kind === "BINANCE"
                              ? [["ID", a.accountNumber], ["Titular", a.holder]]
                              : [["Correo", a.accountNumber], ["Titular", a.holder]];
                      return (
                        <div key={a.id} className="rounded-2xl bg-muted p-3">
                          <div className="mb-1.5 flex items-center gap-2.5">
                            <span className="grid h-10 w-14 place-items-center overflow-hidden rounded-[12px] bg-white px-1.5 py-1 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
                              {logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} alt={name} className="size-full object-contain" />
                              ) : (
                                <span className="text-[13px] font-extrabold text-primary">{name.slice(0, 3).toUpperCase()}</span>
                              )}
                            </span>
                            <b className="font-bold">{name}</b>
                          </div>
                          {rows
                            .filter((r): r is [string, string] => !!r[1])
                            .map(([k, v]) => (
                              <div key={k} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5">
                                <span className="text-muted-foreground">{k}</span>
                                <b className="text-right font-bold tabular-nums">{v}</b>
                              </div>
                            ))}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button type="button" variant="outline" onClick={() => copyAccount(a)}>
                              {copiedId === a.id ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                              {copiedId === a.id ? "Datos copiados" : "Copiar datos"}
                            </Button>
                            <Button type="button" onClick={() => sendAccount(a)} className="bg-[#25d366] text-[#052e16] hover:bg-[#25d366]/90">
                              <WhatsappIcon className="size-4" /> Enviar por WhatsApp
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {selM && selCur && (
                <section className={CARD}>
                  <CardHeader title={selM.label} subtitle={`Monto a cobrar en ${currencyWord(selCur)}`} />
                  <Field label="Monto">
                    <input
                      className={FIELD_INPUT}
                      type="text"
                      inputMode="decimal"
                      value={amountText}
                      onChange={(e) => setAmt(e.target.value)}
                    />
                  </Field>
                  {isCashMethod(selM.id) ? (
                    <>
                      <Field label="El cliente entrega">
                        <input
                          className={FIELD_INPUT}
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={recv}
                          onChange={(e) => setRecv(e.target.value)}
                        />
                      </Field>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {billValues(selCur).map((v) => (
                          <Chip key={v} onClick={() => setRecv(formatAmount(v))}>
                            {selCur === "VES" ? `Bs ${new Intl.NumberFormat("es-VE").format(v)}` : `${selCur === "EUR" ? "€" : "$"}${v}`}
                          </Chip>
                        ))}
                        <Chip onClick={() => setRecv(amountText)}>Exacto</Chip>
                      </div>
                      <div className="mt-2.5">{vuelto}</div>
                    </>
                  ) : (
                    <Field label="Referencia o ID de la operación">
                      <input
                        className={FIELD_INPUT}
                        type="text"
                        inputMode="numeric"
                        placeholder={selM.id === "pm" ? "Últimos 6 dígitos" : "Número de referencia"}
                        value={ref}
                        onChange={(e) => setRef(e.target.value)}
                      />
                    </Field>
                  )}
                  {mode === "split" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" onClick={addLine}>
                        <PlusIcon className="size-4" strokeWidth={2.6} /> Agregar este pago
                      </Button>
                    </div>
                  )}
                  {selIgtf != null && (
                    <p className="mt-2 text-[13px] text-muted-foreground">
                      {igtfLabel} sobre el pago en divisas: {fmtRef(selIgtf)}
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3.5">
          <section className={CARD}>
            <p className="kr-eyebrow">Saldo pendiente</p>
            <div className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.04em] tabular-nums">{fmtRef(exo ? 0 : sum.saldoCents)}</div>
            {fmtLocal(exo ? 0 : sum.saldoCents) && (
              <div className="text-muted-foreground">
                {fmtLocal(exo ? 0 : sum.saldoCents)} · tasa {formatAmount(rate ?? 0)}
              </div>
            )}
            <div className="mt-3 mb-1 h-2 min-w-[60px] overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full transition-[width] duration-300",
                  sum.done && (total > 0 || exo) ? "bg-(--m-caja)" : "bg-(--m-inv)"
                )}
                style={{ width: `${total ? Math.min(100, ((exo ? 0 : sum.paidCents) / total) * 100) : 0}%` }}
              />
            </div>
            <small className="text-[0.8333em] text-muted-foreground">
              Cubierto {fmtRef(exo ? 0 : sum.paidCents)} de {fmtRef(total)}
            </small>
            {lines.length > 0 && (
              <div className="mt-2.5">
                {lines.map((l, i) => {
                  const m = posMethod(l.id);
                  return (
                    <div key={i} className="flex items-center justify-between gap-2.5 border-b border-border py-2.5">
                      <div>
                        <b className="font-bold">{m.label}</b>
                        <small className="block text-[0.8333em] text-muted-foreground">{l.reference ? `Ref. ${l.reference}` : ""}</small>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <b className="font-bold tabular-nums">{fmtIn(l.amount, methodCurrency(m, ctx))}</b>
                        <button
                          type="button"
                          aria-label="Quitar pago"
                          onClick={() => setLines(lines.filter((_, j) => j !== i))}
                          className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
                        >
                          <XIcon className="size-[18px]" strokeWidth={2.4} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {igtf > 0 && (
              <div className="flex items-center justify-between gap-2.5 border-b border-border py-2.5">
                <span className="text-muted-foreground">{igtfLabel} (divisas)</span>
                <b className="font-bold tabular-nums">{fmtRef(igtf)}</b>
              </div>
            )}
          </section>

          <section className={CARD}>
            <CardHeader title="Descuento y documento" />
            <div className="flex flex-wrap gap-2">
              {[0, 5, 10, 15, 20].map((v) => (
                <Chip key={v} active={!exo && discType === "%" && discText === "" && discountValue === v} onClick={() => setPercent(v)}>
                  {v ? `${v} %` : "Sin"}
                </Chip>
              ))}
            </div>
            <div className="mt-2.5">
              <Field label="Cupón de descuento">
                {couponCode ? (
                  <div className="flex items-center justify-between gap-2.5 rounded-[12px] bg-muted px-3 py-2.5">
                    <span>
                      <b className="font-mono tracking-[0.05em]">{couponCode}</b> aplicado a <b>{customerName}</b>: {discountValue} % de descuento
                    </span>
                    <Button type="button" size="sm" variant="outline" onClick={onCouponRemoved}>
                      Quitar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      className={cn(FIELD_INPUT, "font-bold uppercase tracking-[0.06em]")}
                      type="text"
                      maxLength={14}
                      placeholder="Ej: VUELVE15"
                      value={couponText}
                      onChange={(e) => {
                        setCouponText(normalizePromoCode(e.target.value));
                        setCouponError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && couponText) redeemCoupon();
                      }}
                    />
                    <Button type="button" variant="outline" disabled={couponPending || couponText.length < 3} onClick={redeemCoupon}>
                      Canjear
                    </Button>
                  </div>
                )}
              </Field>
              {couponError && (
                <p role="alert" className="mt-1.5 text-[13px] font-semibold text-destructive">
                  {couponError}
                </p>
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-2 items-end gap-2.5 [&>label]:mt-0 [&>label]:min-w-0">
              <Field label="Otro descuento">
                <input
                  className={FIELD_INPUT}
                  type="text"
                  inputMode="decimal"
                  placeholder="Escribe cuánto"
                  value={discText}
                  onChange={(e) => onDiscText(e.target.value)}
                />
              </Field>
              <Field label="Tipo">
                <select
                  className={FIELD_INPUT}
                  value={discType}
                  onChange={(e) => {
                    const t = e.target.value as "%" | "$";
                    setDiscType(t);
                    if (discText) onDiscText(discText, t);
                  }}
                >
                  <option value="%">Porcentaje (%)</option>
                  <option value="$">Monto ({referenceCurrency === "EUR" ? "€" : "$"})</option>
                </select>
              </Field>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2.5 border-b border-border py-2.5">
              <div>
                <b className="font-bold">Venta exonerada</b>
                <small className="block text-[0.8333em] text-muted-foreground">Descuento del 100 %: total {fmtRef(0)} y no requiere cobro</small>
              </div>
              <Switch on={exo} onChange={toggleExo} label="Venta exonerada" />
            </div>
            {exo && (
              <Field label="Motivo de la exoneración">
                <input
                  className={FIELD_INPUT}
                  type="text"
                  placeholder="Ej: obsequio, muestra, autoconsumo"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            )}
            <h3 className="mt-3.5 mb-1 text-[13px] font-bold tracking-[0.08em] text-muted-foreground uppercase">Documento</h3>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Documento">
              {(
                [
                  ["delivery", "Nota de entrega", "Carta, PDF y WhatsApp"],
                  ["ticket", "Ticket de caja", "Ticket rápido de caja"],
                ] as const
              ).map(([k, title, hint]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={documentKind === k}
                  onClick={() => onDocumentKindChange(k)}
                  className={cn(
                    "relative flex min-h-16 min-w-0 flex-col items-start justify-center gap-0.5 rounded-2xl border-2 bg-muted px-3.5 py-3 text-left",
                    documentKind === k ? "border-foreground" : "border-transparent"
                  )}
                >
                  <b className="pr-[26px] text-sm font-bold">{title}</b>
                  <small className="block text-xs whitespace-normal text-muted-foreground">{hint}</small>
                </button>
              ))}
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="relative flex min-h-16 min-w-0 cursor-not-allowed flex-col items-start justify-center gap-0.5 rounded-2xl border-2 border-transparent bg-muted px-3.5 py-3 text-left opacity-60"
              >
                <span className="absolute top-2.5 right-2.5 grid size-6 place-items-center">
                  <LockIcon className="size-[18px]" strokeWidth={2.2} aria-hidden />
                </span>
                <b className="pr-[26px] text-sm font-bold">Factura fiscal</b>
                <small className="block text-xs text-muted-foreground">Próximamente</small>
              </button>
            </div>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+8px)] z-[5] flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-card px-4 py-3 shadow-(--shadow-float) md:bottom-0">
        <div className="min-w-0">
          <small className="text-[0.8333em] text-muted-foreground">Estado tras este cobro</small>
          <b className="block font-bold">{status}</b>
          {msg && (
            <p role="alert" className="text-[13px] font-semibold text-destructive">
              {msg}
            </p>
          )}
        </div>
        <Button
          type="button"
          disabled={ctaDisabled}
          loading={isPending}
          onClick={confirm}
          className="min-h-[54px] px-3.5 text-[15px] font-extrabold"
        >
          {cta}
        </Button>
      </div>
    </div>
  );
}

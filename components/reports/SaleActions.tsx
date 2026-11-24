"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { voidSale, registerPayment, getVoidRefundPlan } from "@/lib/actions/sales";
import { OutflowLineFields } from "@/components/payments/OutflowLineFields";
import { InsufficientFundsNotice, type FundsError } from "@/components/accounts/InsufficientFundsNotice";
import { useSourceAccountsReload } from "@/components/purchases/AccountSelect";
import { lineToSource, type OutflowLine } from "@/lib/cash-outflow";
import { listPaymentAccounts } from "@/lib/actions/payment-accounts";
import { accountChoiceMessage } from "@/lib/payment-method-accounts";
import { ACCOUNT_KIND_LABELS } from "@/lib/payment-accounts";
import {
  PaymentSplitBuilder,
  defaultPaymentSplitRows,
  isPaymentSplitWithinRemaining,
} from "@/components/payments/PaymentSplitBuilder";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { PaymentStatus, ReferenceCurrency } from "@prisma/client";

export function SaleActions({
  saleId,
  voided,
  paymentStatus,
  totalCents,
  remainingCents,
  currentRate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  canManage,
  hasInvoice,
}: {
  saleId: string;
  voided: boolean;
  paymentStatus: PaymentStatus;
  totalCents: number;
  // Outstanding balance for a CREDIT sale — equal to totalCents until any
  // abono has been registered against it (see registerPayment).
  remainingCents: number;
  currentRate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  // Anular is manager-only on the server; sellers only get
  // "Registrar pago".
  canManage: boolean;
  // A sale with a factura is cancelled with a nota de crédito, not "Anular".
  hasInvoice: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [paymentRows, setPaymentRows] = useState(() =>
    defaultPaymentSplitRows(remainingCents, currentRate, exchangeRateEnabled)
  );
  const [payError, setPayError] = useState<string | null>(null);
  // Cuentas donde se puede recibir el abono (se cargan al abrir el diálogo).
  const [receivingAccounts, setReceivingAccounts] = useState<{ id: string; label: string; currency: string; kind: string }[]>([]);
  useEffect(() => {
    if (!payOpen) return;
    let alive = true;
    listPaymentAccounts()
      .then((rows) => alive && setReceivingAccounts(rows.map((a) => ({ id: a.id, label: [a.bankName ?? ACCOUNT_KIND_LABELS[a.kind], a.accountNumber].filter(Boolean).join(" · "), currency: "VES", kind: a.kind }))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [payOpen]);
  const router = useRouter();

  // Anular: ¿cómo se devuelve el dinero? Por defecto, como se cobró (método, cuenta y moneda); se puede editar.
  const [voidOpen, setVoidOpen] = useState(false);
  const [refundLines, setRefundLines] = useState<OutflowLine[]>([]);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voidFunds, setVoidFunds] = useState<FundsError | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const { accounts: sourceAccounts, reload: reloadSources } = useSourceAccountsReload(true, voidOpen);
  const hadPayments = paymentStatus === "PAID" || remainingCents < totalCents;
  useEffect(() => {
    if (!voidOpen || !hadPayments) return;
    let alive = true;
    getVoidRefundPlan(saleId)
      .then((plan) => {
        if (!alive) return;
        setRefundLines(
          plan.lines.map((l) => ({ method: l.paymentMethod, accountId: l.paymentAccountId ?? "", currency: l.currency, amount: (l.amountCents / 100).toFixed(2) }))
        );
        setPlanLoaded(true);
      })
      .catch(() => alive && setPlanLoaded(true));
    return () => {
      alive = false;
    };
  }, [voidOpen, hadPayments, saleId]);

  const withinRemaining = isPaymentSplitWithinRemaining(
    paymentRows,
    currencyCode,
    currentRate,
    remainingCents,
    exchangeRateEnabled,
    referenceCurrency
  );

  function handleVoid(e: React.MouseEvent) {
    e.preventDefault();
    setVoidError(null);
    setVoidFunds(null);
    if (hadPayments) {
      if (refundLines.length === 0) {
        setVoidError("Indica cómo se devuelve el dinero al cliente.");
        return;
      }
      for (const l of refundLines) {
        const missing = accountChoiceMessage(l.method, sourceAccounts, l.accountId);
        if (missing) {
          setVoidError(missing);
          return;
        }
      }
    }
    startTransition(async () => {
      const result = await voidSale(saleId, hadPayments ? refundLines.map((l) => lineToSource(l, sourceAccounts, exchangeRateEnabled)) : undefined);
      if (!result.success) {
        if (result.code === "INSUFFICIENT_FUNDS") setVoidFunds(result);
        else setVoidError(result.error);
        return;
      }
      setVoidOpen(false);
      router.refresh();
    });
  }

  function handleRegisterPayment(e: React.MouseEvent) {
    e.preventDefault();
    setPayError(null);
    for (const r of paymentRows) {
      const missing = accountChoiceMessage(r.paymentMethod, receivingAccounts, r.paymentAccountId);
      if (missing) {
        setPayError("Elige en qué cuenta se recibió el pago.");
        return;
      }
    }
    startTransition(async () => {
      const result = await registerPayment(saleId, {
        payments: paymentRows.map((r) => ({
          paymentMethod: r.paymentMethod,
          amount: r.amount,
          paidInForeignCurrency: r.paidInForeignCurrency,
          reference: r.reference,
          paymentAccountId: r.paymentAccountId || undefined,
        })),
      });
      if (!result.success) {
        // Kept open (unlike the DialogClose-driven dialogs below) so a
        // rejected abono — e.g. the balance changed concurrently, or it
        // exceeds what's owed — is actually visible instead of the dialog
        // closing optimistically and silently discarding the error.
        setPayError(result.error);
        return;
      }
      setPayOpen(false);
      router.refresh();
    });
  }

  const isPartiallyPaid = remainingCents < totalCents;

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-2">
      <div className="flex justify-center">
      {!voided && paymentStatus === "CREDIT" && (
        <Dialog
          open={payOpen}
          onOpenChange={(open) => {
            setPayOpen(open);
            if (!open) setPayError(null);
          }}
        >
          <DialogTrigger render={<Button size="sm" disabled={isPending} />}>
            {isPartiallyPaid ? "Registrar abono" : "Registrar pago"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar abono a esta venta</DialogTitle>
              <DialogDescription>
                Indica cómo y en qué moneda pagó el cliente — puedes dividirlo en varios métodos, y
                no tiene que ser el saldo completo: cada abono queda con su propia fecha y tasa de
                cambio. La venta solo pasa a &quot;Pagada&quot; (con el recibo de pago disponible)
                cuando el saldo llega a 0.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {isPartiallyPaid && (
                <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="text-muted-foreground">Total de la venta</span>
                  <span className="font-medium">
                    {exchangeRateEnabled
                      ? currentRate != null
                        ? formatLocalCurrency(eurCentsToLocal(totalCents, currentRate), currencyCode)
                        : "—"
                      : formatCurrencyCents(referenceCurrency, totalCents)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm text-muted-foreground">Saldo pendiente</span>
                <div className="flex flex-col items-end">
                  <span className="font-semibold">
                    {exchangeRateEnabled
                      ? currentRate != null
                        ? formatLocalCurrency(eurCentsToLocal(remainingCents, currentRate), currencyCode)
                        : "—"
                      : formatCurrencyCents(referenceCurrency, remainingCents)}
                  </span>
                  {exchangeRateEnabled && (
                    <span className="text-xs text-muted-foreground">
                      {formatCurrencyCents(referenceCurrency, remainingCents)}
                    </span>
                  )}
                </div>
              </div>
              <PaymentSplitBuilder
                rows={paymentRows}
                onChange={setPaymentRows}
                totalCents={remainingCents}
                rate={currentRate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
                idPrefix={`pay-${saleId}`}
                mode="upTo"
                accounts={receivingAccounts}
                accountLabel="¿En qué cuenta se recibió el pago?"
              />
              {payError && <p className="text-sm text-destructive">{payError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button disabled={isPending || !withinRemaining} onClick={handleRegisterPayment}>
                Registrar abono
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      </div>
      <div className="flex justify-end">
      {/* Inline buttons, not a popover/drawer menu: a dialog opened from
          inside one closed together with the menu (same bug as Compartir). */}
      {canManage && !voided && (hasInvoice ? (
        <div className="flex items-center gap-2">
          {["Nota de débito", "Nota de crédito"].map((label) => (
            <Button key={label} size="sm" variant="outline" disabled aria-disabled="true" title="Próximamente">
              {label} · Próximamente
            </Button>
          ))}
        </div>
      ) : (
        <Dialog
          open={voidOpen}
          onOpenChange={(o) => {
            setVoidOpen(o);
            if (!o) {
              setVoidError(null);
              setVoidFunds(null);
              setPlanLoaded(false);
            }
          }}
        >
          <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
            Anular
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Anular esta venta?</DialogTitle>
              <DialogDescription>
                El stock de los productos vendidos se repondrá y la venta dejará de contar en
                los ingresos y gráficas. Seguirá visible en el historial marcada como
                &quot;Anulada&quot;.
                {hadPayments &&
                  " Esta venta ya tenía cobros: indica cómo se le devuelve el dinero al cliente. Lo que salga en efectivo resta de la caja y lo que salga de una cuenta baja su saldo."}
              </DialogDescription>
            </DialogHeader>
            {hadPayments && (
              <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
                {!planLoaded && <p className="text-sm text-muted-foreground">Cargando cobros…</p>}
                {refundLines.map((l, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-[14px] border p-3">
                    <div className="flex items-center justify-between">
                      <b className="text-sm">Devolución {refundLines.length > 1 ? i + 1 : ""}</b>
                      {refundLines.length > 1 && (
                        <Button type="button" size="xs" variant="ghost" onClick={() => setRefundLines((r) => r.filter((_, j) => j !== i))}>
                          Quitar
                        </Button>
                      )}
                    </div>
                    <OutflowLineFields
                      line={l}
                      onChange={(n) => setRefundLines((r) => r.map((x, j) => (j === i ? n : x)))}
                      accounts={sourceAccounts}
                      money={{ rate: currentRate, exchangeRateEnabled, localCurrencyCode: currencyCode, referenceCurrency }}
                      amountLabel="Monto a devolver"
                    />
                  </div>
                ))}
                {planLoaded && (
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRefundLines((r) => [...r, { method: "CASH", accountId: "", currency: exchangeRateEnabled ? "LOCAL" : "REFERENCE", amount: "" }])}
                    >
                      Agregar otra devolución
                    </Button>
                  </div>
                )}
                {voidFunds && (
                  <InsufficientFundsNotice failure={voidFunds} accounts={sourceAccounts} onFunded={() => { setVoidFunds(null); reloadSources(); }} />
                )}
              </div>
            )}
            {voidError && <p role="alert" className="text-sm text-destructive">{voidError}</p>}
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button disabled={isPending || (hadPayments && !planLoaded)} onClick={handleVoid}>
                Anular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
      </div>
    </div>
  );
}

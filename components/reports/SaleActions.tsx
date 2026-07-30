"use client";

import { useState, useTransition } from "react";
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
import { voidSale, deleteSale, registerPayment } from "@/lib/actions/sales";
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
}) {
  const [isPending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [paymentRows, setPaymentRows] = useState(() =>
    defaultPaymentSplitRows(remainingCents, currentRate, exchangeRateEnabled)
  );
  const [payError, setPayError] = useState<string | null>(null);
  const router = useRouter();

  const withinRemaining = isPaymentSplitWithinRemaining(
    paymentRows,
    currencyCode,
    currentRate,
    remainingCents,
    exchangeRateEnabled,
    referenceCurrency
  );

  function handleVoid() {
    startTransition(async () => {
      await voidSale(saleId);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteSale(saleId);
      router.refresh();
    });
  }

  function handleRegisterPayment(e: React.MouseEvent) {
    e.preventDefault();
    setPayError(null);
    startTransition(async () => {
      const result = await registerPayment(saleId, {
        payments: paymentRows.map((r) => ({
          paymentMethod: r.paymentMethod,
          amount: r.amount,
          paidInForeignCurrency: r.paidInForeignCurrency,
          reference: r.reference,
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
    <div className="flex justify-end gap-2">
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
      {!voided && (
        <Dialog>
          <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
            Anular
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Anular esta venta?</DialogTitle>
              <DialogDescription>
                El stock de los productos vendidos se repondrá y la venta dejará de contar en los
                ingresos y gráficas. Seguirá visible en el historial marcada como &quot;Anulada&quot;.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <DialogClose render={<Button disabled={isPending} />} onClick={handleVoid}>
                Anular
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Dialog>
        <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
          Eliminar
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar esta venta?</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. {!voided && "El stock de los productos vendidos se repondrá y "}
              la venta desaparecerá por completo del historial y los reportes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <DialogClose
              render={<Button variant="destructive" disabled={isPending} />}
              onClick={handleDelete}
            >
              Eliminar
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

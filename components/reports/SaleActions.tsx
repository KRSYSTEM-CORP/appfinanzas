"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export function SaleActions({
  saleId,
  voided,
  paymentStatus,
}: {
  saleId: string;
  voided: boolean;
  paymentStatus: PaymentStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payReference, setPayReference] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const router = useRouter();

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
        paymentMethod: payMethod,
        paymentReference: payReference,
      });
      if (!result.success) {
        setPayError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-2">
      {!voided && paymentStatus === "CREDIT" && (
        <Dialog>
          <DialogTrigger render={<Button size="sm" disabled={isPending} />}>
            Registrar pago
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registrar pago de esta venta</DialogTitle>
              <DialogDescription>
                Indica cómo pagó el cliente. La venta pasará a &quot;Pagada&quot; con la tasa de
                cambio de hoy y dejará de contar en el total por cobrar.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
                  <Button
                    key={method}
                    type="button"
                    size="sm"
                    variant={payMethod === method ? "default" : "outline"}
                    onClick={() => setPayMethod(method)}
                    className="flex-1"
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </Button>
                ))}
              </div>
              {payMethod === "CARD" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`payRef-${saleId}`}>Número de referencia (Pago Móvil)</Label>
                  <Input
                    id={`payRef-${saleId}`}
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="Ej. 001234567"
                  />
                </div>
              )}
              {payError && <p className="text-sm text-destructive">{payError}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <DialogClose
                render={<Button disabled={isPending} />}
                onClick={handleRegisterPayment}
              >
                Registrar pago
              </DialogClose>
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

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
import { markPurchasePaid, voidPurchase, deletePurchase } from "@/lib/actions/purchases";

export function PurchaseActions({
  purchaseId,
  paymentStatus,
  voided,
}: {
  purchaseId: string;
  paymentStatus: "PAID" | "PENDING";
  voided: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleMarkPaid() {
    setError(null);
    startTransition(async () => {
      const result = await markPurchasePaid(purchaseId);
      if (!result.success) setError(result.error);
      router.refresh();
    });
  }

  function handleVoid() {
    startTransition(async () => {
      await voidPurchase(purchaseId);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deletePurchase(purchaseId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        {!voided && paymentStatus === "PENDING" && (
          <Button size="sm" disabled={isPending} onClick={handleMarkPaid}>
            Marcar pagada
          </Button>
        )}
        {!voided && (
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="outline" disabled={isPending} />}>
              Anular
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Anular esta compra?</DialogTitle>
                <DialogDescription>
                  El stock de los productos comprados se revertirá. Seguirá visible en el historial
                  marcada como &quot;Anulada&quot;.
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
              <DialogTitle>¿Eliminar esta compra?</DialogTitle>
              <DialogDescription>
                Esta acción es irreversible. {!voided && "El stock revertido por esta compra se restará y "}
                la compra desaparecerá por completo del historial.
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

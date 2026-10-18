"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
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
import { markPurchasePaid, voidPurchase } from "@/lib/actions/purchases";

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

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end items-center gap-2">
        {!voided && paymentStatus === "PENDING" && (
          <Button size="sm" disabled={isPending} onClick={handleMarkPaid}>
            Marcar pagada
          </Button>
        )}
        {!voided ? (
          <ActionMenu
            trigger={<Button size="icon-sm" variant="ghost" disabled={isPending} aria-label="Más acciones" />}
            triggerChildren={<MoreVerticalIcon />}
          >
            <Dialog>
              <DialogTrigger
                render={
                  <button
                    type="button"
                    disabled={isPending}
                    className="px-2.5 py-2 text-sm rounded-md text-left hover:bg-muted transition-colors disabled:opacity-50"
                  />
                }
              >
                Anular
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Anular esta compra?</DialogTitle>
                  <DialogDescription>
                    El stock de los productos comprados se revertirá. Seguirá visible en el
                    historial marcada como &quot;Anulada&quot;.
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
          </ActionMenu>
        ) : null}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

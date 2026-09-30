"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
      <div className="flex justify-end items-center gap-2">
        {!voided && paymentStatus === "PENDING" && (
          <Button size="sm" disabled={isPending} onClick={handleMarkPaid}>
            Marcar pagada
          </Button>
        )}
        {!voided ? (
          <Popover>
            <PopoverTrigger
              render={<Button size="icon-sm" variant="ghost" disabled={isPending} aria-label="Más acciones" />}
            >
              <MoreVerticalIcon />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1.5">
              <div className="flex flex-col gap-0.5">
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
                <Dialog>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        disabled={isPending}
                        className="px-2.5 py-2 text-sm rounded-md text-left text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                      />
                    }
                  >
                    Eliminar
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>¿Eliminar esta compra?</DialogTitle>
                      <DialogDescription>
                        Esta acción es irreversible. El stock revertido por esta compra se restará y
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
            </PopoverContent>
          </Popover>
        ) : (
          <Dialog>
            <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
              Eliminar
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>¿Eliminar esta compra?</DialogTitle>
                <DialogDescription>
                  Esta acción es irreversible. La compra desaparecerá por completo del historial.
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
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

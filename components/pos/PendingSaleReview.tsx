"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { formatCurrencyCents } from "@/lib/currencies";
import { discardPendingSale, listPendingSales, syncPendingSales, type PendingSale } from "@/lib/offline/sync";

// A queued offline sale only ever fails to sync for a real reason —
// completeSale's own server-side stock re-check is what blocks it (see
// lib/actions/sales.ts and lib/offline/sync.ts) — never because of a
// silent overwrite. This screen is where that block gets resolved by hand,
// since the sale represents a payment the cashier already collected from a
// real customer: retry it once the reason is fixed (e.g. stock restocked),
// or discard it explicitly, which never happens automatically.
export function PendingSaleReview() {
  const [pending, setPending] = useState<PendingSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const all = await listPendingSales();
    setPending(all.filter((s) => s.lastError));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function retry(localId: string) {
    setSyncingId(localId);
    try {
      // syncPendingSales() replays every queued sale, not just this one —
      // there's no per-sale entry point today, and re-trying the whole queue
      // is harmless (a sale that already synced fine simply isn't in it
      // anymore).
      await syncPendingSales();
    } finally {
      setSyncingId(null);
      await refresh();
    }
  }

  async function discard(localId: string) {
    await discardPendingSale(localId);
    await refresh();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Cargando...</p>;
  }

  if (pending.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay ventas pendientes de revisión — todas las ventas encoladas sin conexión se
        sincronizaron correctamente.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending.map((sale) => (
        <div key={sale.localId} className="rounded-lg border p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">
                {sale.preview.items.reduce((sum, i) => sum + i.quantity, 0)} artículo
                {sale.preview.items.reduce((sum, i) => sum + i.quantity, 0) === 1 ? "" : "s"} ·{" "}
                {formatCurrencyCents("USD", sale.preview.totalCents)}
              </p>
              <p className="text-xs text-muted-foreground">
                Encolada el {new Date(sale.queuedAt).toLocaleString("es")}
                {sale.preview.sellerName && ` · Vendedor: ${sale.preview.sellerName}`}
              </p>
            </div>
          </div>
          <p className="text-sm text-destructive">{sale.lastError}</p>
          <Separator />
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {sale.preview.items.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>
                  {item.quantity} × {item.productName}
                </span>
                <span>{formatCurrencyCents("USD", item.subtotalCents)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <Dialog>
              <DialogTrigger render={<Button size="sm" variant="destructive" />}>Descartar</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>¿Descartar esta venta?</DialogTitle>
                  <DialogDescription>
                    Esta venta ya fue cobrada a un cliente real y no se registrará en el sistema.
                    Asegúrate de resolverlo con el cliente antes de continuar — esto no se puede
                    deshacer.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                  <DialogClose render={<Button variant="destructive" onClick={() => discard(sale.localId)} />}>
                    Sí, descartar
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button size="sm" disabled={syncingId === sale.localId} onClick={() => retry(sale.localId)}>
              {syncingId === sale.localId ? "Reintentando..." : "Reintentar"}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

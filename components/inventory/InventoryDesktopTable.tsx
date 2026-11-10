"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVerticalIcon } from "lucide-react";
import type { ReferenceCurrency } from "@prisma/client";
import { productImageUrl, type ListedProduct } from "@/lib/product-image";
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
} from "@/components/ui/dialog";
import { Price } from "@/components/money/Price";
import { formatCurrencyCents } from "@/lib/currencies";

type Status = "ok" | "low" | "out" | "inactive";

function statusOf(p: ListedProduct): Status {
  if (!p.isActive) return "inactive";
  if (!p.trackStock) return "ok";
  if (p.stock <= 0) return "out";
  return p.stock <= p.lowStockThreshold ? "low" : "ok";
}

const STATUS_UI: Record<Status, { label: string; pill: string; bar: string }> = {
  ok: { label: "Disponible", pill: "bg-success/14 text-success", bar: "bg-success" },
  low: { label: "Stock bajo", pill: "bg-warning/18 text-warning", bar: "bg-[var(--warning)]" },
  out: { label: "Agotado", pill: "bg-destructive/12 text-destructive", bar: "bg-destructive" },
  inactive: { label: "Inactivo", pill: "bg-muted text-muted-foreground", bar: "bg-muted-foreground/40" },
};

// Tabla de escritorio de la preview v15: producto, categoría, existencia contra el
// mínimo (barra), estado, costo, precio, valor en stock y menú ⋮ por producto.
// En teléfono se sigue usando la lista con hoja inferior (ProductMasterDetail).
export function InventoryDesktopTable({
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  canManage,
  isPending,
  onToggleActive,
  onDelete,
}: {
  products: ListedProduct[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  canManage: boolean;
  isPending: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [toDelete, setToDelete] = useState<ListedProduct | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-2xl bg-card shadow-(--shadow-card)">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-2 py-3 font-medium">Categoría</th>
              <th className="px-2 py-3 font-medium">Existencia vs. mínimo</th>
              <th className="px-2 py-3 font-medium">Estado</th>
              <th className="px-2 py-3 text-right font-medium">Costo</th>
              <th className="px-2 py-3 text-right font-medium">Precio</th>
              <th className="px-2 py-3 text-right font-medium">Valor en stock</th>
              <th className="px-4 py-3 text-right font-medium">Ajustar</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const st = statusOf(p);
              const ui = STATUS_UI[st];
              const img = productImageUrl(p);
              const barPct = p.trackStock ? Math.min(100, Math.round((p.stock / Math.max(p.lowStockThreshold * 3, 1)) * 100)) : 100;
              const value = p.trackStock && p.costCents != null ? p.stock * p.costCents : null;
              return (
                <tr key={p.id} className="border-t border-border/70">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary" aria-hidden>
                          {p.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className={`truncate font-semibold ${p.isActive ? "" : "text-muted-foreground line-through"}`}>{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.sku ?? "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    {p.category ? <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{p.category}</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-3">
                    {p.trackStock ? (
                      <div className="flex min-w-36 flex-col gap-1">
                        <span className="font-semibold tabular-nums">{p.stock} und.</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Existencia de ${p.name}`} aria-valuenow={barPct} aria-valuemin={0} aria-valuemax={100}>
                          <div className={`h-full rounded-full ${ui.bar}`} style={{ width: `${Math.max(barPct, p.stock > 0 ? 6 : 0)}%` }} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">Mín: {p.lowStockThreshold}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin control de stock</span>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${ui.pill}`}>
                      <span className={`size-1.5 rounded-full ${ui.bar}`} aria-hidden />
                      {ui.label}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">{p.costCents != null ? formatCurrencyCents(referenceCurrency, p.costCents) : "—"}</td>
                  <td className="px-2 py-3 text-right whitespace-nowrap [&_*]:whitespace-nowrap">
                    <Price eurCents={p.priceCents} rate={rate} currencyCode={currencyCode} exchangeRateEnabled={exchangeRateEnabled} referenceCurrency={referenceCurrency} className="items-end" />
                  </td>
                  <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums">{value != null ? formatCurrencyCents(referenceCurrency, value) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <span className="whitespace-nowrap tabular-nums font-semibold">{p.trackStock ? `${p.stock} und.` : ""}</span>
                      <ActionMenu
                        trigger={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Acciones de ${p.name}`} />}
                        triggerChildren={<MoreVerticalIcon className="size-4" />}
                        contentClassName="md:w-48"
                      >
                        <Button variant="ghost" className="w-full justify-start" nativeButton={false} render={<Link href={`/inventory/${p.id}/movements`} />}>
                          Movimientos
                        </Button>
                        {canManage && (
                          <>
                            <Button variant="ghost" className="w-full justify-start" nativeButton={false} render={<Link href={`/inventory/${p.id}`} />}>
                              Editar
                            </Button>
                            <Button variant="ghost" className="w-full justify-start" disabled={isPending} onClick={() => onToggleActive(p.id, p.isActive)}>
                              {p.isActive ? "Desactivar" : "Activar"}
                            </Button>
                            <Button variant="ghost" className="w-full justify-start text-destructive" disabled={isPending} onClick={() => setToDelete(p)}>
                              Eliminar
                            </Button>
                          </>
                        )}
                      </ActionMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={toDelete != null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar &quot;{toDelete?.name}&quot;?</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. El producto desaparecerá del inventario y del punto de venta. Las ventas y
              presupuestos ya generados con este producto no se ven afectados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <DialogClose
              render={<Button variant="destructive" disabled={isPending} />}
              onClick={() => toDelete && onDelete(toDelete.id)}
            >
              Eliminar
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

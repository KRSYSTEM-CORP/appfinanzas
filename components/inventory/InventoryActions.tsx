"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { DownloadIcon, ListChecksIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ListedProduct } from "@/lib/product-image";
import { isLowStock } from "@/lib/inventory";
import { downloadWorkbook } from "@/lib/spreadsheet";
import { formatCurrencyCents } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

// Cantidad sugerida: lo que falta para llegar al doble del mínimo (como en la preview).
function suggestedQty(p: ListedProduct): number {
  return Math.max(p.lowStockThreshold * 2 - p.stock, 1);
}

// «Lista de reposición» y «Exportar Excel» de la barra de Inventario.
export function InventoryActions({
  products,
  referenceCurrency,
}: {
  products: ListedProduct[];
  referenceCurrency: ReferenceCurrency;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const needs = products
    .filter((p) => p.isActive && isLowStock(p))
    .sort((a, b) => a.stock - b.stock);
  const totalCost = needs.reduce((s, p) => s + suggestedQty(p) * (p.costCents ?? 0), 0);

  async function exportExcel() {
    setBusy(true);
    try {
      await downloadWorkbook(
        [
          {
            name: "Inventario",
            rows: [
              ["Producto", "SKU", "Categoría", "Stock", "Mínimo", "Costo", "Precio", "Estado"],
              ...products.map((p) => [
                p.name,
                p.sku ?? "",
                p.category ?? "",
                p.trackStock ? p.stock : "",
                p.trackStock ? p.lowStockThreshold : "",
                p.costCents != null ? p.costCents / 100 : "",
                p.priceCents / 100,
                !p.isActive ? "Inactivo" : p.trackStock && p.stock <= 0 ? "Agotado" : isLowStock(p) ? "Stock bajo" : "Disponible",
              ]),
            ],
          },
        ],
        "inventario.xlsx"
      );
    } catch {
      toast.error("No se pudo generar el Excel. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <ListChecksIcon /> Lista de reposición
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={exportExcel}>
        <DownloadIcon /> {busy ? "Generando..." : "Exportar Excel"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{needs.length ? "Lista de reposición" : "Todo en orden"}</DialogTitle>
            <DialogDescription>
              {needs.length
                ? "Cantidades sugeridas para llegar al doble del mínimo."
                : "No hay productos por reponer."}
            </DialogDescription>
          </DialogHeader>
          {needs.length > 0 && (
            <>
              <ul className="flex max-h-80 flex-col divide-y overflow-y-auto">
                {needs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Tienes {p.stock} · mínimo {p.lowStockThreshold}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">Pedir {suggestedQty(p)}</p>
                      {p.costCents != null && <p>{formatCurrencyCents(referenceCurrency, suggestedQty(p) * p.costCents)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t-2 pt-3 text-sm font-bold">
                <span>Costo estimado</span>
                <span className="tabular-nums">{formatCurrencyCents(referenceCurrency, totalCost)}</span>
              </div>
              <Link href="/purchases/new" className={buttonVariants({ variant: "default", size: "lg" })}>
                Crear orden de compra
              </Link>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

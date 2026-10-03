"use client";

import Link from "next/link";
import { PackageIcon, PackageSearchIcon } from "lucide-react";
import type { Product, ReferenceCurrency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Price } from "@/components/money/Price";
import { LowStockBadge } from "@/components/inventory/LowStockBadge";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { isLowStock } from "@/lib/inventory";

// The product list: a compact list with a sticky detail panel on desktop and a
// compact list with a bottom sheet on phones (see MasterDetail).
export function ProductMasterDetail({
  products,
  totalCount,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  canManage,
  isPending,
  onToggleActive,
  onDelete,
  onClearFilters,
}: {
  products: Product[];
  totalCount: number;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  canManage: boolean;
  isPending: boolean;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onClearFilters: () => void;
}) {
  const priceOf = (p: Product, size?: "sm" | "lg") => (
    <Price
      eurCents={p.priceCents}
      rate={rate}
      currencyCode={currencyCode}
      exchangeRateEnabled={exchangeRateEnabled}
      referenceCurrency={referenceCurrency}
      size={size}
      className="items-end"
    />
  );

  const empty = (
    <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
      <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
        <PackageSearchIcon className="size-5" />
      </div>
      {totalCount === 0 ? (
        <>
          <p className="text-sm font-medium">Aún no tienes productos</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Agrega tu primer producto para empezar a vender y controlar tu inventario.
          </p>
          {canManage && (
            <Button size="sm" nativeButton={false} render={<Link href="/inventory/new" />}>
              Nuevo producto
            </Button>
          )}
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Ningún producto coincide</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Prueba con otro término de búsqueda o quita algún filtro.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        </>
      )}
    </div>
  );

  return (
    <MasterDetail
      items={products}
      label="Productos"
      empty={empty}
      renderRow={(p) => (
        <>
          {p.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageDataUrl} alt="" className="size-10 shrink-0 rounded-lg border object-cover" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <PackageIcon className="size-4 text-muted-foreground/50" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className={`truncate text-sm font-semibold ${p.isActive ? "" : "text-destructive"}`}>{p.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {p.category ?? "Sin categoría"}
              {!p.isActive && " · Inactivo"}
            </div>
          </div>
          <div className="flex w-16 shrink-0 justify-center">
            {p.trackStock && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${
                  isLowStock(p) ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                }`}
              >
                {p.stock}
              </span>
            )}
          </div>
          <div className="flex w-28 shrink-0 justify-end text-sm">{priceOf(p)}</div>
        </>
      )}
      renderRowMobile={(p) => (
        <MobileRow
          title={<span className={p.isActive ? "" : "text-destructive"}>{p.name}</span>}
          meta={
            <>
              {p.category ?? "Sin categoría"}
              {p.trackStock && (
                <>
                  {" · "}
                  <span className={`font-medium tabular-nums ${isLowStock(p) ? "text-warning" : "text-success"}`}>
                    Stock {p.stock}
                  </span>
                </>
              )}
            </>
          }
          badge={
            !p.isActive ? (
              <Badge variant="destructive">Inactivo</Badge>
            ) : p.trackStock && isLowStock(p) ? (
              <Badge variant="warning">Stock bajo</Badge>
            ) : undefined
          }
          amount={priceOf(p)}
        />
      )}
      renderDetail={(selected) => (
        <>
          {selected.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.imageDataUrl} alt="" className="h-32 w-full rounded-xl border object-cover" />
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-xl bg-muted">
              <PackageIcon className="size-8 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <h3 className={`text-lg font-semibold leading-tight ${selected.isActive ? "" : "text-destructive"}`}>
              {selected.name}
            </h3>
            <p className="text-sm text-muted-foreground">{selected.category ?? "Sin categoría"}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2 flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Precio</dt>
              <dd className="flex">{priceOf(selected, "lg")}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Estado</dt>
              <dd>
                <Badge variant={selected.isActive ? "success" : "destructive"}>
                  {selected.isActive ? "Activo" : "Inactivo"}
                </Badge>
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Stock</dt>
              <dd className="flex items-center gap-2">
                <span className="font-medium tabular-nums">{selected.stock}</span>
                <LowStockBadge product={selected} />
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">SKU</dt>
              <dd className="font-medium">{selected.sku ?? "—"}</dd>
            </div>
          </dl>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button nativeButton={false} render={<Link href={`/inventory/${selected.id}`} />}>
                Editar producto
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onToggleActive(selected.id, selected.isActive)}
              >
                {selected.isActive ? "Desactivar" : "Activar"}
              </Button>
              <Dialog>
                <DialogTrigger render={<Button type="button" variant="destructive" disabled={isPending} className="ml-auto" />}>
                  Eliminar
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>¿Eliminar &quot;{selected.name}&quot;?</DialogTitle>
                    <DialogDescription>
                      Esta acción es irreversible. El producto desaparecerá del inventario y del punto de
                      venta. Las ventas y presupuestos ya generados con este producto no se ven afectados.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                    <DialogClose
                      render={<Button variant="destructive" disabled={isPending} />}
                      onClick={() => onDelete(selected.id)}
                    >
                      Eliminar
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </>
      )}
    />
  );
}

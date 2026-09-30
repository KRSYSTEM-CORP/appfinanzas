"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon, PackageSearchIcon, XIcon } from "lucide-react";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { deleteProduct, setProductActive } from "@/lib/actions/products";
import { isLowStock } from "@/lib/inventory";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { ReferenceCurrency } from "@prisma/client";

const ALL_CATEGORIES = "__all__";
const UNCATEGORIZED = "__uncategorized__";

type StockFilter = "all" | "low" | "positive" | "inactive";

const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  all: "Todos los productos",
  low: "Stock bajo",
  positive: "Stock positivo",
  inactive: "Desactivados",
};

export function ProductTable({
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  categories,
  canManage,
  companyId,
}: {
  products: Product[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  categories: string[];
  canManage: boolean;
  companyId: string;
}) {
  useLiveRefresh(`pos:${companyId}`, "product");
  useLiveRefresh(`pos:${companyId}`, "sale");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Totals reflect the whole inventory (every product, active or not) by
  // category — a physical stock count doesn't stop being real just because a
  // product was manually deactivated, so deactivated stock is included here
  // even though it's excluded from the sellable catalog everywhere else.
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, { stock: number; count: number }>();
    for (const p of products) {
      const key = p.category?.trim() || UNCATEGORIZED;
      const entry = totals.get(key) ?? { stock: 0, count: 0 };
      entry.stock += p.stock;
      entry.count += 1;
      totals.set(key, entry);
    }
    return Array.from(totals.entries())
      .map(([key, value]) => ({ category: key === UNCATEGORIZED ? "Sin categoría" : key, ...value }))
      .sort((a, b) => b.stock - a.stock);
  }, [products]);
  const totalStock = categoryTotals.reduce((sum, c) => sum + c.stock, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      const matchesCategory = category === ALL_CATEGORIES || p.category === category;
      const matchesStock =
        stockFilter === "all"
          ? true
          : stockFilter === "inactive"
            ? !p.isActive
            : stockFilter === "low"
              ? p.isActive && isLowStock(p)
              : p.isActive && !isLowStock(p);
      return matchesQuery && matchesCategory && matchesStock;
    });
  }, [products, query, category, stockFilter]);

  const hasActiveFilters = query.trim() !== "" || category !== ALL_CATEGORIES || stockFilter !== "all";

  function clearFilters() {
    setQuery("");
    setCategory(ALL_CATEGORIES);
    setStockFilter("all");
  }

  function toggleActive(id: string, isActive: boolean) {
    startTransition(async () => {
      await setProductActive(id, !isActive);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteProduct(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border overflow-x-auto">
        <div className="px-3 py-2 border-b bg-muted/40 text-sm font-medium">Resumen por categoría</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Productos</TableHead>
              <TableHead className="text-right">Stock total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categoryTotals.map((c) => (
              <TableRow key={c.category}>
                <TableCell>{c.category}</TableCell>
                <TableCell className="text-right text-muted-foreground">{c.count}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{c.stock}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell className="font-medium">Total general</TableCell>
              <TableCell className="text-right text-muted-foreground">{products.length}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{totalStock}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          type="search"
          aria-label="Buscar productos por nombre o SKU"
          placeholder="Buscar por nombre o SKU..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={category} onValueChange={(v) => setCategory(v ?? ALL_CATEGORIES)}>
          <SelectTrigger aria-label="Filtrar por categoría">
            <SelectValue placeholder="Categoría">
              {(value: string | null) =>
                !value || value === ALL_CATEGORIES ? "Todas las categorías" : value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter((v as StockFilter) ?? "all")}>
          <SelectTrigger aria-label="Filtrar por estado de stock">
            <SelectValue placeholder="Estado de stock">
              {(value: string | null) => STOCK_FILTER_LABELS[(value as StockFilter) ?? "all"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STOCK_FILTER_LABELS) as StockFilter[]).map((k) => (
              <SelectItem key={k} value={k}>
                {STOCK_FILTER_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
            <XIcon /> Limpiar filtros
          </Button>
        )}
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length === products.length
            ? `${products.length} producto${products.length === 1 ? "" : "s"}`
            : `${filtered.length} de ${products.length} productos`}
        </span>
      </div>

      <p className="sm:hidden text-xs text-muted-foreground px-1">Desliza la tabla para ver más →</p>
      <div className="relative rounded-lg border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Estado</TableHead>
              {canManage && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className={!p.isActive ? "text-destructive" : undefined}>
                <TableCell className="font-medium whitespace-normal">
                  <div className="flex items-center gap-2">
                    {p.imageDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageDataUrl} alt="" className="h-8 w-8 rounded object-cover border shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded border bg-muted shrink-0" />
                    )}
                    {p.name}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{p.sku ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{p.category ?? "—"}</TableCell>
                <TableCell>
                  <Price
                    eurCents={p.priceCents}
                    rate={rate}
                    currencyCode={currencyCode}
                    exchangeRateEnabled={exchangeRateEnabled}
                    referenceCurrency={referenceCurrency}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{p.stock}</span>
                    <LowStockBadge product={p} />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={p.isActive ? "success" : "destructive"}>
                    {p.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={<Link href={`/inventory/${p.id}`} />}
                      >
                        Editar
                      </Button>
                      <Popover>
                        <PopoverTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              disabled={isPending}
                              aria-label={`Más acciones para ${p.name}`}
                            />
                          }
                        >
                          <MoreVerticalIcon />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-48 p-1.5">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => toggleActive(p.id, p.isActive)}
                              className="px-2.5 py-2 text-sm rounded-md text-left hover:bg-muted transition-colors disabled:opacity-50"
                            >
                              {p.isActive ? "Desactivar" : "Activar"}
                            </button>
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
                                  <DialogTitle>¿Eliminar &quot;{p.name}&quot;?</DialogTitle>
                                  <DialogDescription>
                                    Esta acción es irreversible. El producto desaparecerá del inventario
                                    y del punto de venta. Las ventas y presupuestos ya generados con
                                    este producto no se ven afectados.
                                  </DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                  <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                                  <DialogClose
                                    render={<Button variant="destructive" disabled={isPending} />}
                                    onClick={() => handleDelete(p.id)}
                                  >
                                    Eliminar
                                  </DialogClose>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={canManage ? 7 : 6} className="p-0">
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                      <PackageSearchIcon className="size-5" />
                    </div>
                    {products.length === 0 ? (
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
                        <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                          Limpiar filtros
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
        <div className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
      </div>
    </div>
  );
}

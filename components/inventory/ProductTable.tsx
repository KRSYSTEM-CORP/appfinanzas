"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Categoría</th>
              <th className="px-3 py-2 font-medium text-right">Productos</th>
              <th className="px-3 py-2 font-medium text-right">Stock total</th>
            </tr>
          </thead>
          <tbody>
            {categoryTotals.map((c) => (
              <tr key={c.category} className="border-b last:border-0">
                <td className="px-3 py-1.5">{c.category}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{c.count}</td>
                <td className="px-3 py-1.5 text-right font-medium">{c.stock}</td>
              </tr>
            ))}
            <tr className="bg-muted/40">
              <td className="px-3 py-1.5 font-medium">Total general</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">{products.length}</td>
              <td className="px-3 py-1.5 text-right font-semibold">{totalStock}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Buscar por nombre o SKU..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={category} onValueChange={(v) => setCategory(v ?? ALL_CATEGORIES)}>
          <SelectTrigger>
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
          <SelectTrigger>
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
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className={!p.isActive ? "opacity-50" : undefined}>
                <TableCell className="font-medium">
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
                <TableCell>{p.sku ?? "—"}</TableCell>
                <TableCell>{p.category ?? "—"}</TableCell>
                <TableCell>
                  <Price
                    eurCents={p.priceCents}
                    rate={rate}
                    currencyCode={currencyCode}
                    exchangeRateEnabled={exchangeRateEnabled}
                    referenceCurrency={referenceCurrency}
                  />
                </TableCell>
                <TableCell className="flex items-center gap-2">
                  {p.stock}
                  <LowStockBadge product={p} />
                </TableCell>
                <TableCell>{p.isActive ? "Activo" : "Inactivo"}</TableCell>
                <TableCell className="text-right">
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={<Link href={`/inventory/${p.id}`} />}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant={p.isActive ? "destructive" : "secondary"}
                        disabled={isPending}
                        onClick={() => toggleActive(p.id, p.isActive)}
                      >
                        {p.isActive ? "Desactivar" : "Activar"}
                      </Button>
                      <Dialog>
                        <DialogTrigger render={<Button size="sm" variant="destructive" disabled={isPending} />}>
                          Eliminar
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>¿Eliminar &quot;{p.name}&quot;?</DialogTitle>
                            <DialogDescription>
                              Esta acción es irreversible. El producto desaparecerá del inventario y
                              del punto de venta. Las ventas y presupuestos ya generados con este
                              producto no se ven afectados.
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
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No se encontraron productos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

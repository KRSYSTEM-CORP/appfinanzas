"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SearchIcon, XIcon } from "lucide-react";
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
import { ProductMasterDetail } from "@/components/inventory/ProductMasterDetail";
import { deleteProduct, setProductActive, type getInventoryOverview } from "@/lib/actions/products";
import { isLowStock } from "@/lib/inventory";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { ReferenceCurrency } from "@prisma/client";

const ALL_CATEGORIES = "__all__";

type StockFilter = "all" | "low" | "positive" | "inactive";

const STOCK_FILTER_LABELS: Record<StockFilter, string> = {
  all: "Todos los productos",
  low: "Stock bajo",
  positive: "Stock positivo",
  inactive: "Desactivados",
};

export function ProductTable({
  products,
  inventory,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  categories,
  canManage,
  companyId,
}: {
  products: Product[];
  inventory: Awaited<ReturnType<typeof getInventoryOverview>>;
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

  const { categoryTotals, totalStock, lowStockCount, totalCount } = inventory;

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
      const result = await setProductActive(id, !isActive);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteProduct(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden grid-cols-3 gap-3 md:grid">
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Productos en catálogo</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{totalCount.toLocaleString("es-VE")}</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Unidades registradas</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{totalStock.toLocaleString("es-VE")}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${lowStockCount ? "border-warning/25 bg-warning/5" : "bg-card"}`}>
          <p className="text-xs text-muted-foreground">Productos con stock bajo</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${lowStockCount ? "text-warning" : ""}`}>{lowStockCount.toLocaleString("es-VE")}</p>
        </div>
      </div>

      <details className="hidden rounded-xl border bg-card md:block">
        <summary className="min-h-11 cursor-pointer list-none px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            Existencias por categoría
            <span className="text-xs font-normal text-muted-foreground">{categoryTotals.length} categorías</span>
          </span>
        </summary>
        <div className="overflow-x-auto border-t">
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
                  <TableCell className="text-right font-medium tabular-nums">{c.stock.toLocaleString("es-VE")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm sm:w-auto sm:flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar productos por nombre o SKU"
            placeholder="Buscar por nombre o SKU..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
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
            ? totalCount > products.length
              ? `Mostrando ${products.length} de ${totalCount} productos`
              : `${totalCount} producto${totalCount === 1 ? "" : "s"}`
            : `${filtered.length} de ${products.length} cargados`}
        </span>
      </div>

      {totalCount > products.length && (
        <p className="-mt-2 text-xs text-muted-foreground">
          El listado muestra hasta {products.length} productos; los indicadores y existencias por categoría sí incluyen el catálogo completo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 md:hidden">
        <div className="rounded-xl border bg-card px-3.5 py-3">
          <p className="text-xs text-muted-foreground">Productos</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{totalCount.toLocaleString("es-VE")}</p>
        </div>
        <div className="rounded-xl border bg-card px-3.5 py-3">
          <p className="text-xs text-muted-foreground">Unidades en stock</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{totalStock.toLocaleString("es-VE")}</p>
        </div>
        {lowStockCount > 0 && (
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-warning/20 bg-warning/5 px-3.5 py-2.5">
            <span className="text-sm text-warning">Productos con stock bajo</span>
            <span className="font-semibold tabular-nums text-warning">{lowStockCount}</span>
          </div>
        )}
      </div>

      <details className="rounded-xl border bg-card md:hidden">
        <summary className="min-h-11 cursor-pointer list-none px-3.5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-3">
            Resumen por categoría
            <span className="text-xs font-normal text-muted-foreground">{categoryTotals.length} categorías</span>
          </span>
        </summary>
        <div className="border-t px-3.5">
          {categoryTotals.map((c) => (
            <div key={c.category} className="flex min-h-11 items-center justify-between gap-3 border-b last:border-b-0">
              <span className="min-w-0 truncate text-sm">{c.category}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.count} prod. <span className="mx-1" aria-hidden="true">·</span> Stock {c.stock.toLocaleString("es-VE")}
              </span>
            </div>
          ))}
        </div>
      </details>

      <ProductMasterDetail
        products={filtered}
        totalCount={totalCount}
        rate={rate}
        currencyCode={currencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        canManage={canManage}
        isPending={isPending}
        onToggleActive={toggleActive}
        onDelete={handleDelete}
        onClearFilters={clearFilters}
      />
    </div>
  );
}

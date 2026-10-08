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
      <div className="rounded-lg border bg-card shadow-xs overflow-x-auto">
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
            ? `${products.length} producto${products.length === 1 ? "" : "s"}`
            : `${filtered.length} de ${products.length} productos`}
        </span>
      </div>

      <ProductMasterDetail
        products={filtered}
        totalCount={products.length}
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

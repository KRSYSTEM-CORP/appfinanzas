"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleCheckIcon, CircleXIcon, PackageIcon, SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import type { ListedProduct } from "@/lib/product-image";
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
import { InventoryActions } from "@/components/inventory/InventoryActions";
import { ProductMasterDetail } from "@/components/inventory/ProductMasterDetail";
import { InventoryDesktopTable } from "@/components/inventory/InventoryDesktopTable";
import { deleteProduct, setProductActive, type getInventoryOverview } from "@/lib/actions/products";
import { isLowStock } from "@/lib/inventory";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { ReferenceCurrency } from "@prisma/client";

const ALL_CATEGORIES = "__all__";

type StockFilter = "all" | "low" | "positive" | "out" | "inactive";


export function ProductTable({
  products,
  inventory,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  categories,
  canManage,
  canSeeCosts = true,
  companyId,
}: {
  products: ListedProduct[];
  inventory: Awaited<ReturnType<typeof getInventoryOverview>>;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  categories: string[];
  canManage: boolean;
  canSeeCosts?: boolean;
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
              ? p.isActive && isLowStock(p) && p.stock > 0
              : stockFilter === "out"
                ? p.isActive && p.trackStock && p.stock <= 0
                : p.isActive && !isLowStock(p);
      return matchesQuery && matchesCategory && matchesStock;
    });
  }, [products, query, category, stockFilter]);

  const counts = useMemo(() => {
    let ok = 0, low = 0, out = 0, inactive = 0;
    for (const p of products) {
      if (!p.isActive) inactive++;
      else if (p.trackStock && p.stock <= 0) out++;
      else if (isLowStock(p)) low++;
      else ok++;
    }
    return { all: products.length, ok, low, out, inactive };
  }, [products]);

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
      <div className="hidden grid-cols-4 gap-3.5 md:grid">
        {(
          [
            { key: "all", label: "Total de productos", value: totalCount, sub: "En el catálogo", tone: "text-primary bg-primary/12", Icon: PackageIcon },
            { key: "positive", label: "Disponibles", value: counts.ok, sub: "Con stock suficiente", tone: "text-success bg-success/14", Icon: CircleCheckIcon },
            { key: "low", label: "Stock bajo", value: counts.low, sub: "En o debajo del mínimo", tone: "text-warning bg-warning/18", Icon: TriangleAlertIcon },
            { key: "out", label: "Agotados", value: counts.out, sub: "Requieren reposición ya", tone: "text-destructive bg-destructive/12", Icon: CircleXIcon },
          ] as { key: StockFilter; label: string; value: number; sub: string; tone: string; Icon: React.ComponentType<{ className?: string }> }[]
        ).map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setStockFilter(c.key)}
            aria-pressed={stockFilter === c.key}
            className={`relative flex min-h-32 flex-col gap-1.5 rounded-[19px] border-2 bg-card p-[17px] text-left shadow-(--shadow-card) transition-[transform,border-color] duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${
              stockFilter === c.key ? "border-primary" : "border-transparent"
            }`}
          >
            <span className="pr-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</span>
            <span className={`absolute right-4 top-4 grid size-[34px] place-items-center rounded-full ${c.tone}`} aria-hidden>
              <c.Icon className="size-[18px]" />
            </span>
            <span className="text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{c.value.toLocaleString("es-VE")}</span>
            <span className="text-[13px] text-muted-foreground">{c.sub}</span>
          </button>
        ))}
      </div>

      <details className="order-last hidden rounded-xl border bg-card md:block">
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

      <div className="flex flex-col gap-3 rounded-[22px] bg-card p-3 shadow-(--shadow-card) md:flex-row md:flex-wrap md:items-center">
      <div className="hidden flex-wrap items-center gap-2 md:flex" role="group" aria-label="Filtrar por estado de stock">
        {(
          [
            ["all", "Todos", counts.all, "bg-foreground text-background", ""],
            ["positive", "Disponible", counts.ok, "bg-foreground text-background", "bg-success"],
            ["low", "Stock bajo", counts.low, "bg-foreground text-background", "bg-warning"],
            ["out", "Agotado", counts.out, "bg-foreground text-background", "bg-destructive"],
            ...(counts.inactive > 0 ? [["inactive", "Inactivo", counts.inactive, "bg-foreground text-background", "bg-muted-foreground"]] : []),
          ] as [StockFilter, string, number, string, string][]
        ).map(([key, label, n, on, dot]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStockFilter(key)}
            aria-pressed={stockFilter === key}
            className={`inline-flex min-h-[42px] items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${
              stockFilter === key ? on : "bg-muted text-foreground hover:bg-muted/70"
            }`}
          >
            <span className={`size-2 rounded-full ${dot || "bg-current"}`} aria-hidden />
            {label} <span className="tabular-nums opacity-80">{n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-[200px] sm:w-auto sm:flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar productos por nombre o SKU"
            placeholder="Buscar por nombre o SKU..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 rounded-full border-transparent bg-muted pl-9"
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
        <InventoryActions products={products} referenceCurrency={referenceCurrency} />
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

      <div className="hidden md:block">
        <InventoryDesktopTable
          products={filtered}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          canManage={canManage}
          canSeeCosts={canSeeCosts}
          isPending={isPending}
          onToggleActive={toggleActive}
          onDelete={handleDelete}
        />
      </div>
      <div className="md:hidden">
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
    </div>
  );
}

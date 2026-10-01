"use client";

import { useMemo, useState } from "react";
import type { Product } from "@prisma/client";
import { PackageIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/money/Price";
import { BarcodeScannerDialog } from "@/components/scanner/BarcodeScannerDialog";
import { isLowStock } from "@/lib/inventory";
import type { ReferenceCurrency } from "@prisma/client";

const ALL_CATEGORIES = "__all__";

export function ProductPicker({
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  categories,
  onAdd,
}: {
  products: Product[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  categories: string[];
  onAdd: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [scanError, setScanError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const matchesQuery =
        !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
      const matchesCategory = category === ALL_CATEGORIES || p.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [products, query, category]);

  function handleScan(code: string) {
    setScanError(null);
    const match = products.find((p) => p.sku === code);
    if (!match) {
      setScanError(`Código no encontrado: ${code}`);
      return;
    }
    onAdd(match);
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar producto por nombre o SKU"
            placeholder="Buscar producto por nombre o SKU..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="pl-8"
          />
        </div>
        <BarcodeScannerDialog onDetected={handleScan} />
      </div>
      {scanError && <p className="text-sm text-destructive">{scanError}</p>}
      {categories.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <Button
            type="button"
            size="xs"
            variant={category === ALL_CATEGORIES ? "default" : "outline"}
            onClick={() => setCategory(ALL_CATEGORIES)}
          >
            Todas
          </Button>
          {categories.map((c) => (
            <Button
              key={c}
              type="button"
              size="xs"
              variant={category === c ? "default" : "outline"}
              onClick={() => setCategory(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const outOfStock = p.trackStock && p.stock <= 0;
          return (
            <button
              key={p.id}
              type="button"
              disabled={outOfStock}
              onClick={() => onAdd(p)}
              className="relative flex flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left shadow-xs transition-all duration-150 ease-out-smooth hover:border-ring/40 hover:shadow-sm active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {p.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageDataUrl} alt="" className="h-16 w-full rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-full items-center justify-center rounded-lg bg-muted">
                  <PackageIcon className="size-6 text-muted-foreground/50" />
                </div>
              )}
              <span className="font-medium text-sm">{p.name}</span>
              <Price
                eurCents={p.priceCents}
                rate={rate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
              />
              {p.trackStock && !outOfStock && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Stock: {p.stock}</span>
                  {isLowStock(p) && (
                    <Badge variant="warning" className="text-[10px] h-4">
                      bajo
                    </Badge>
                  )}
                </div>
              )}
              {outOfStock && (
                <Badge variant="destructive" className="text-[10px] h-4">
                  Agotado
                </Badge>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8 text-sm">
            No hay productos que coincidan.
          </p>
        )}
      </div>
    </div>
  );
}

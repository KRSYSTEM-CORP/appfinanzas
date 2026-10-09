"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@prisma/client";
import { PackageIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the catalog search for keyboard users on desktop; on touch devices
  // opening the catalog must not summon the keyboard and hide the products.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
  }, []);

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
            ref={searchRef}
            type="search"
            aria-label="Buscar producto por nombre o SKU"
            placeholder="Buscar producto por nombre o SKU..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <BarcodeScannerDialog onDetected={handleScan} />
      </div>
      {scanError && <p className="text-sm text-destructive">{scanError}</p>}
      {categories.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:pb-0">
          <Button
            type="button"
            size="xs"
            variant={category === ALL_CATEGORIES ? "default" : "outline"}
            className="min-h-10 min-w-max md:min-h-0"
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
              className="min-h-10 min-w-max md:min-h-0"
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
            className="relative flex min-h-11 flex-col items-start gap-1.5 rounded-xl border bg-card p-2.5 text-left shadow-xs transition-all duration-150 ease-out-smooth hover:border-ring/40 hover:shadow-sm active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {p.imageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageDataUrl} alt="" className="h-16 w-full rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-full items-center justify-center rounded-lg bg-muted">
                  <PackageIcon className="size-6 text-muted-foreground/50" />
                </div>
              )}
              <span className="line-clamp-2 min-h-8 text-[13px] leading-tight font-semibold">{p.name}</span>
              <Price
                eurCents={p.priceCents}
                rate={rate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
              />
              {p.trackStock && !outOfStock && (
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    isLowStock(p) ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                  }`}
                >
                  {isLowStock(p) ? `Stock bajo · ${p.stock}` : `Stock ${p.stock}`}
                </span>
              )}
              {outOfStock && (
                <span className="mt-0.5 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  Agotado
                </span>
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { productImageUrl, type ListedProduct } from "@/lib/product-image";
import { PackageIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/money/Price";
import { BarcodeScannerDialog, type ScanFeedback } from "@/components/scanner/BarcodeScannerDialog";
import { findProductByCode, normalizeCode } from "@/lib/barcode";
import { useBarcodeWedge } from "@/lib/use-barcode-wedge";
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
  allowOutOfStock = false,
}: {
  products: ListedProduct[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  categories: string[];
  onAdd: (product: ListedProduct) => void;
  // Presupuestos quote items regardless of stock; the POS must not sell them.
  allowOutOfStock?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [scanNotice, setScanNotice] = useState<ScanFeedback | null>(null);
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

  // Adds a product found by scan or by Enter in the search box. Scanning must
  // respect stock the same way tapping a card does (those are disabled when out
  // of stock) — otherwise a scan could slip an unavailable product into the cart.
  function addMatch(match: ListedProduct): ScanFeedback {
    if (!allowOutOfStock && match.trackStock && match.stock <= 0) return { ok: false, message: `Sin existencias: ${match.name}` };
    onAdd(match);
    return { ok: true, message: `Agregado: ${match.name}` };
  }

  // A hardware scanner also types the code into the search box when that has
  // focus, so the box is cleared after every scan.
  function report(outcome: ScanFeedback): ScanFeedback {
    setQuery("");
    setScanNotice(outcome);
    return outcome;
  }

  function handleScan(rawCode: string): ScanFeedback {
    const match = findProductByCode(products, rawCode);
    return report(
      match ? addMatch(match) : { ok: false, message: `Código no encontrado: ${normalizeCode(rawCode)}` }
    );
  }

  // Enter in the search box: an exact SKU, or the only product left in the list.
  function handleSearchEnter() {
    const q = query.trim();
    if (!q) return;
    const match = findProductByCode(products, q) ?? (filtered.length === 1 ? filtered[0] : null);
    if (match) report(addMatch(match));
  }

  // Hardware scanners work wherever the cursor is, except inside another text
  // field (discount, payment, notes) or while a dialog is open.
  useBarcodeWedge(handleScan, (target) => {
    if (document.querySelector('[role="dialog"]')) return false;
    if (target === searchRef.current) return true;
    const el = target as HTMLElement | null;
    const editable = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    return !editable;
  });

  // The scan result is a transient notice, not a permanent banner.
  useEffect(() => {
    if (!scanNotice) return;
    const timer = setTimeout(() => setScanNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [scanNotice]);

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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearchEnter();
              }
            }}
            className="pl-8"
          />
        </div>
        <BarcodeScannerDialog onDetected={handleScan} continuous />
      </div>
      {scanNotice && (
        <p
          role="status"
          className={`text-sm font-medium ${
            scanNotice.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
          }`}
        >
          {scanNotice.message}
        </p>
      )}
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
          const outOfStock = !allowOutOfStock && p.trackStock && p.stock <= 0;
          return (
            <button
              key={p.id}
              type="button"
              disabled={outOfStock}
              onClick={() => onAdd(p)}
            className="relative flex min-h-11 flex-col items-start gap-1.5 rounded-xl border bg-card p-2.5 text-left shadow-xs transition-all duration-150 ease-out-smooth hover:border-ring/40 hover:shadow-sm active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              {p.hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productImageUrl(p) ?? undefined}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-full rounded-lg object-cover"
                />
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

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { productImageUrl, type ListedProduct } from "@/lib/product-image";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
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
  quantities,
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
  // Unidades de cada producto en la venta actual (insignia y borde de marca).
  quantities?: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [scanNotice, setScanNotice] = useState<ScanFeedback | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sin foco al entrar (en táctil taparía los productos); la tecla «/» enfoca el buscador.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            aria-label="Buscar producto, SKU o escanear"
            placeholder="Buscar producto, SKU o escanear (/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearchEnter();
              }
            }}
            className="min-h-[50px] rounded-full border-[1.5px] border-border bg-card pr-[18px] pl-[46px] text-sm"
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
          {[ALL_CATEGORIES, ...categories].map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)} className="min-w-max">
              {c === ALL_CATEGORIES ? "Todos" : c}
              {c === ALL_CATEGORIES && <small className="text-[0.8333em]">{products.length}</small>}
            </Chip>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,158px),1fr))] gap-2.5 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const outOfStock = !allowOutOfStock && p.trackStock && p.stock <= 0;
          const q = quantities?.[p.id] ?? 0;
          const tint = `var(--chart-${(p.name.charCodeAt(0) % 5) + 1})`;
          return (
            <button
              key={p.id}
              type="button"
              disabled={outOfStock}
              onClick={() => onAdd(p)}
              aria-label={`Agregar ${p.name}`}
              className={`relative flex flex-col items-start gap-1.5 rounded-[19px] border-2 bg-card p-3 text-left shadow-(--shadow-card) transition-[transform,border-color] duration-150 hover:-translate-y-0.5 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:active:scale-100 ${
                q ? "border-primary" : "border-transparent"
              }`}
            >
              {p.hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productImageUrl(p) ?? undefined}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-11 flex-none rounded-[14px] object-cover"
                />
              ) : (
                <span
                  className="grid size-11 flex-none place-items-center rounded-[14px] text-[17px] font-extrabold text-foreground"
                  style={{ background: `color-mix(in oklab, ${tint} 22%, var(--card))` }}
                  aria-hidden
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              {q > 0 && (
                <span className="absolute top-2.5 right-2.5 grid h-[26px] min-w-[26px] place-items-center rounded-full bg-primary px-[7px] text-[13px] font-extrabold text-primary-foreground">
                  {q}
                </span>
              )}
              <b className="line-clamp-2 block min-h-9 text-sm leading-[1.25] font-bold">{p.name}</b>
              <span className="flex flex-col">
                <span className="text-[17px] font-extrabold tabular-nums">{formatCurrencyCents(referenceCurrency, p.priceCents)}</span>
                {exchangeRateEnabled && rate != null && (
                  <small className="text-xs text-muted-foreground tabular-nums">
                    {formatLocalCurrency(eurCentsToLocal(p.priceCents, rate), currencyCode)}
                  </small>
                )}
              </span>
              {p.trackStock && !outOfStock && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-bold ${
                    isLowStock(p) ? "bg-warning/18 text-warning" : "bg-success/14 text-success"
                  }`}
                >
                  <span className="inline-block size-1.5 rounded-full bg-current" aria-hidden />
                  {p.stock} und.
                </span>
              )}
              {outOfStock && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/12 px-2.5 py-[3px] text-xs font-bold text-destructive">
                  <span className="inline-block size-1.5 rounded-full bg-current" aria-hidden />
                  Agotado
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-8 text-sm">
            No hay productos con ese filtro.
          </p>
        )}
      </div>
    </div>
  );
}

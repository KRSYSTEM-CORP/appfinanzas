"use client";

import { useMemo, useState } from "react";
import type { Product } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { isLowStock } from "@/lib/inventory";

export function ProductPicker({
  products,
  onAdd,
}: {
  products: Product[];
  onAdd: (product: Product) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <Input
        placeholder="Buscar producto por nombre o SKU..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const outOfStock = p.stock <= 0;
          return (
            <button
              key={p.id}
              type="button"
              disabled={outOfStock}
              onClick={() => onAdd(p)}
              className="flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="font-medium text-sm">{p.name}</span>
              <span className="text-sm text-muted-foreground">{formatCurrency(p.priceCents)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Stock: {p.stock}</span>
                {isLowStock(p) && (
                  <Badge variant="destructive" className="text-[10px] h-4">
                    bajo
                  </Badge>
                )}
              </div>
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

"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { formatCurrencyCents } from "@/lib/currencies";

type Top = { productId: string | null; productName: string; revenueCents: number };
type Bottom = { productId: string; productName: string; quantity: number };

// Rendimiento de productos: Pareto 80/20 de los más vendidos, o la lista de los que menos se mueven.
export function ProductPerformance({ top, bottom, currency }: { top: Top[]; bottom: Bottom[]; currency: string }) {
  const [mode, setMode] = useState<"top" | "bottom">("top");
  const items = [...top].sort((a, b) => b.revenueCents - a.revenueCents);
  const total = items.reduce((t, i) => t + i.revenueCents, 0);
  const rows = items.map((i, idx) => {
    const before = items.slice(0, idx).reduce((t, x) => t + x.revenueCents, 0);
    return { ...i, before, cum: Math.round(((before + i.revenueCents) / total) * 100) };
  });
  const classA = rows.filter((r) => r.before < total * 0.8).length;
  const max = items[0]?.revenueCents ?? 1;

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Tipo de ranking"
        value={mode}
        onChange={setMode}
        options={[
          { value: "top", label: "Más vendidos" },
          { value: "bottom", label: "Menos vendidos" },
        ]}
      />
      {mode === "top" ? (
        items.length === 0 || total <= 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas de productos en este período.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {rows.map((r) => (
                <li key={`${r.productId}-${r.productName}`} className="grid grid-cols-[130px_1fr_84px_44px] items-center gap-3 text-sm">
                  <span className="truncate font-medium">{r.productName}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${r.before < total * 0.8 ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${Math.max(2, Math.round((r.revenueCents / max) * 100))}%` }} />
                  </div>
                  <span className="text-right font-semibold tabular-nums">{formatCurrencyCents(currency, r.revenueCents)}</span>
                  <span className="text-right text-xs text-muted-foreground tabular-nums">{r.cum} %</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Los primeros {classA} {classA === 1 ? "producto genera" : "productos generan"} el 80 % de la venta (clase A). Cuídalos de agotarse.
            </p>
          </>
        )
      ) : bottom.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin productos activos para mostrar.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {bottom.slice(0, 10).map((b) => (
            <li key={b.productId} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
              <span className="truncate font-medium">{b.productName}</span>
              <span className={`tabular-nums ${b.quantity === 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                {b.quantity} {b.quantity === 1 ? "unidad" : "unidades"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

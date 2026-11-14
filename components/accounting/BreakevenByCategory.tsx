"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Note, SectionCard } from "@/components/shared/SectionCard";
import { Pill } from "@/components/shared/Pills";
import { EqMeter } from "@/components/accounting/BalanceSummary";
import { breakevenByCategory, type CategoryMargin } from "@/lib/breakeven";
import { money, pct } from "@/lib/money-display";

// «Punto de equilibrio por categoría» con el conmutador Categoría · Producto (preview, Resumen).
export function BreakevenByCategory({
  categories,
  products,
  expensesCents,
  salesCents,
  currency,
}: {
  categories: CategoryMargin[];
  products: CategoryMargin[];
  expensesCents: number;
  salesCents: number;
  currency: string;
}) {
  const [view, setView] = useState<"cat" | "prod">("cat");
  const m = (c: number) => money(currency, c, 0);
  const productsRevenue = products.reduce((a, r) => a + r.revenueCents, 0);
  const productExpenses = salesCents > 0 ? Math.round((expensesCents * productsRevenue) / salesCents) : 0;
  const rows = view === "cat" ? breakevenByCategory(categories, expensesCents) : breakevenByCategory(products, productExpenses);

  return (
    <SectionCard
      title={view === "cat" ? "Punto de equilibrio por categoría" : "Punto de equilibrio por producto"}
      subtitle="Cuántas ventas hacen falta para cubrir los gastos asignados y una buena ganancia"
      action={
        <Segmented
          label="Ver por"
          value={view}
          onChange={setView}
          options={[
            { value: "cat", label: "Categoría" },
            { value: "prod", label: "Producto" },
          ]}
        />
      }
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Sin ventas en este periodo.</p>
      ) : (
        rows.map((r) => {
          const eq = r.breakevenCents;
          const max = Math.max(r.revenueCents, eq ?? 0) * 1.1 || 1;
          const diff = eq != null ? r.revenueCents - eq : null;
          return (
            <div key={r.category} className="border-b py-2.5 last-of-type:border-b-0">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <b>{r.category}</b>
                {eq == null ? <Pill>Sin margen</Pill> : r.covered ? <Pill tone="ok">Sobre equilibrio</Pill> : <Pill tone="bad">Bajo equilibrio</Pill>}
              </div>
              <EqMeter compact fill={(r.revenueCents / max) * 100} marker={eq != null ? (eq / max) * 100 : null} markerLabel={eq != null ? m(eq) : ""} />
              <small className="text-xs text-muted-foreground">
                Vendido {m(r.revenueCents)} · gastos asignados {m(r.allocatedExpensesCents)} · margen de contribución {pct(r.margin, 1)}
                {diff != null && ` · ${diff >= 0 ? "+" : "−"}${m(Math.abs(diff))} ${diff >= 0 ? "sobre" : "bajo"} el equilibrio`}
              </small>
            </div>
          );
        })
      )}
      <Note>
        Los gastos del periodo ({m(expensesCents)}) se reparten según el peso de cada {view === "cat" ? "categoría" : "producto"} en las ventas; el margen descuenta el costo de lo vendido.
      </Note>
    </SectionCard>
  );
}

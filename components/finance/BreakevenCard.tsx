"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCents } from "@/lib/currencies";
import { setProfitGoal } from "@/lib/actions/finance";
import { breakevenByCategory, marginRatio, revenueNeeded, type CategoryMargin } from "@/lib/breakeven";
import type { ReferenceCurrency } from "@prisma/client";

export function BreakevenCard({
  revenueCents,
  cogsCents,
  expensesCents,
  categories,
  goalCents,
  referenceCurrency,
}: {
  revenueCents: number;
  cogsCents: number;
  expensesCents: number;
  categories: CategoryMargin[];
  goalCents: number | null;
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(goalCents != null ? String(goalCents / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);

  const margin = marginRatio(revenueCents, cogsCents);
  const breakeven = revenueNeeded(expensesCents, margin);
  const forGoal = goalCents != null ? revenueNeeded(expensesCents + goalCents, margin) : null;
  const pctOf = (needed: number | null) =>
    needed && needed > 0 ? Math.min(100, Math.round((revenueCents / needed) * 100)) : 0;
  const rows = breakevenByCategory(categories, expensesCents);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = goal.trim() === "" ? null : Math.round(Number(goal) * 100);
    startTransition(async () => {
      const result = await setProfitGoal(cents);
      if (result.success) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Punto de equilibrio</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {breakeven == null ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay margen en este período para calcular el equilibrio (necesita ventas con costo de mercancía).
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Margen de contribución</p>
              <p className="text-lg font-semibold">{Math.round(margin * 100)} %</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Ventas para cubrir los gastos</p>
              <p className="text-lg font-semibold">{money(breakeven)}</p>
              <ProgressBar pct={pctOf(breakeven)} />
              <p className="text-xs text-muted-foreground">Llevas {money(revenueCents)} ({pctOf(breakeven)} %)</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Ventas para tu meta de ganancia</p>
              <p className="text-lg font-semibold">{forGoal != null ? money(forGoal) : "Define una meta"}</p>
              {forGoal != null && <ProgressBar pct={pctOf(forGoal)} />}
            </div>
          </div>
        )}

        <form onSubmit={save} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profit-goal">Meta de ganancia del período</Label>
            <Input
              id="profit-goal"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-40"
              placeholder="0,00"
            />
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            Guardar meta
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>

        {rows.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Por categoría</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Categoría</th>
                    <th className="py-1 pr-3 text-right font-medium">Ventas</th>
                    <th className="py-1 pr-3 text-right font-medium">Margen</th>
                    <th className="py-1 pr-3 text-right font-medium">Equilibrio</th>
                    <th className="py-1 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.category} className="border-t">
                      <td className="py-1.5 pr-3">{r.category}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.revenueCents)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{Math.round(r.margin * 100)} %</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {r.breakevenCents != null ? money(r.breakevenCents) : "—"}
                      </td>
                      <td className={`py-1.5 ${r.covered ? "text-success" : "text-warning"}`}>
                        {r.covered ? "Cubre su parte" : "Por debajo"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Los gastos se reparten entre categorías según su peso en las ventas del período.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="my-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

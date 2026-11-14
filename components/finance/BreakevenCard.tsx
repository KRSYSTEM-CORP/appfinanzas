"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { formatCurrencyCents } from "@/lib/currencies";
import { setProfitGoal } from "@/lib/actions/finance";
import { breakevenByCategory, marginRatio, revenueNeeded, type CategoryMargin } from "@/lib/breakeven";
import { StatsCard } from "@/components/finance/StatsUi";
import s from "@/components/finance/stats.module.css";

// Punto de equilibrio con el medidor de la preview: barra verde de lo vendido,
// marca negra del equilibrio, línea punteada de la proyección del mes y la
// meta de ganancia guardada. El cálculo es el de lib/breakeven (sin cambios).
export function BreakevenCard({
  revenueCents,
  cogsCents,
  expensesCents,
  goalCents,
  projectionCents,
  currency,
}: {
  revenueCents: number;
  cogsCents: number;
  expensesCents: number;
  goalCents: number | null;
  projectionCents: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(goalCents != null ? String(goalCents / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const money = (c: number) => formatCurrencyCents(currency, c);

  const margin = marginRatio(revenueCents, cogsCents);
  const breakeven = revenueNeeded(expensesCents, margin);
  const forGoal = goalCents != null ? revenueNeeded(expensesCents + goalCents, margin) : null;

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

  const mxv = Math.max(breakeven ?? 0, revenueCents, projectionCents ?? 0, forGoal ?? 0, 1) * 1.08;
  const pct = (v: number) => `${Math.min(100, (v / mxv) * 100)}%`;
  const over = breakeven != null && revenueCents >= breakeven;

  return (
    <StatsCard title="Punto de equilibrio" sub="Lo que necesitas vender para cubrir costos y gastos">
      {breakeven == null ? (
        <p className={s.empty}>Aún no hay margen en este período para calcular el equilibrio (necesita ventas con costo de mercancía).</p>
      ) : (
        <>
          <div className={s.eq} role="img" aria-label="Medidor de equilibrio">
            <div className={`${s.f} ${s.a} ${s.growX}`} data-tone={over ? undefined : "bad"} style={{ width: pct(Math.min(revenueCents, mxv)) }} />
            {projectionCents != null && <div className={`${s.p} ${s.a} ${s.fillIn}`} style={{ width: pct(projectionCents), ["--d" as string]: "900ms" }} />}
            <div className={`${s.mk} ${s.a} ${s.fadeUp}`} style={{ left: pct(breakeven), ["--d" as string]: "600ms" }}>
              <em>Equilibrio {money(breakeven)}</em>
            </div>
            {forGoal != null && (
              <div className={`${s.mk} ${s.a} ${s.fadeUp}`} style={{ left: pct(forGoal), background: "var(--primary)", top: 0, bottom: 0, ["--d" as string]: "800ms" }} title={`Meta ${money(forGoal)}`} />
            )}
          </div>
          <div className={s.chiprow} style={{ marginTop: 10 }}>
            <span className={s.pill} data-tone="ok">
              Vendido {money(revenueCents)}
            </span>
            {projectionCents != null && (
              <span className={s.pill} data-tone="val">
                Proyección {money(projectionCents)}
              </span>
            )}
            <span className={s.pill}>Margen de contribución {Math.round(margin * 100)} %</span>
            {forGoal != null && (
              <span className={s.pill} data-tone={revenueCents >= forGoal ? "ok" : "warn"}>
                Para tu meta {money(forGoal)}
              </span>
            )}
          </div>
          <p className={s.note} style={{ fontSize: 14, color: "var(--foreground)" }}>
            {over ? (
              <>
                Ya superaste el punto de equilibrio de <b>{money(breakeven)}</b>: vas <b style={{ color: "var(--success)" }}>{money(revenueCents - breakeven)}</b> por encima.
              </>
            ) : (
              <>
                Aún te faltan <b style={{ color: "var(--destructive)" }}>{money(breakeven - revenueCents)}</b> para cubrir tus costos.
              </>
            )}
            {projectionCents != null && (
              <>
                {" "}
                Si mantienes este ritmo cerrarás el mes en <b>{money(projectionCents)}</b>.
              </>
            )}
          </p>
          {projectionCents == null && <p className={s.note}>La proyección a fin de mes está disponible en el periodo «Mes».</p>}
        </>
      )}

      <form onSubmit={save} className={s.chiprow} style={{ marginTop: 14, alignItems: "flex-end" }}>
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
        <button type="submit" className={s.btn} data-primary="" disabled={isPending}>
          Guardar meta
        </button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>
    </StatsCard>
  );
}

// Punto de equilibrio por categoría o por producto (conmutador de la preview).
// Cada fila: nombre, pill Sobre/Bajo equilibrio y el medidor con su marca.
export function BreakevenBreakdownCard({
  revenueCents,
  expensesCents,
  categories,
  products,
  currency,
}: {
  revenueCents: number;
  expensesCents: number;
  categories: CategoryMargin[];
  products: CategoryMargin[];
  currency: string;
}) {
  const [view, setView] = useState<"cat" | "prod">("cat");
  const money = (c: number) => formatCurrencyCents(currency, c);
  const catRows = breakevenByCategory(categories, expensesCents);
  // A los 15 productos solo se les reparte la parte de los gastos que les toca
  // por su peso en las ventas totales (el resto la absorben los demás).
  const productsRevenue = products.reduce((a, r) => a + r.revenueCents, 0);
  const productExpenses = revenueCents > 0 ? Math.round((expensesCents * productsRevenue) / revenueCents) : 0;
  const prodRows = breakevenByCategory(products, productExpenses);
  const rows = view === "cat" ? catRows : prodRows;

  return (
    <StatsCard
      title={`Punto de equilibrio por ${view === "cat" ? "categoría" : "producto"}`}
      sub="Cuántas ventas hacen falta para cubrir los gastos asignados y una buena ganancia"
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
        <p className={s.empty}>Sin ventas con costo registrado en este período.</p>
      ) : view === "cat" ? (
        <div key="cat">
          {rows.map((r, i) => {
            const be = r.breakevenCents;
            const mx = Math.max(be ?? 0, r.revenueCents, 1) * 1.1;
            return (
              <div key={r.category} className={s.eqr}>
                <div className={s.eqh}>
                  <b>{r.category}</b>
                  <span className={s.pill} data-tone={r.covered ? "ok" : "bad"}>
                    {r.covered ? "Sobre equilibrio" : "Bajo equilibrio"}
                  </span>
                </div>
                <div className={s.eq} role="img" aria-label={`Equilibrio de ${r.category}`}>
                  <div className={`${s.f} ${s.a} ${s.growX}`} data-tone={r.covered ? undefined : "bad"} style={{ width: `${(r.revenueCents / mx) * 100}%`, ["--i" as string]: i }} />
                  {be != null && (
                    <div className={`${s.mk} ${s.a} ${s.fadeUp}`} style={{ left: `${(be / mx) * 100}%`, ["--i" as string]: i, ["--d" as string]: "500ms" }}>
                      <em>{money(be)}</em>
                    </div>
                  )}
                </div>
                <small className={s.muted}>
                  Vendido {money(r.revenueCents)} · gastos asignados {money(r.allocatedExpensesCents)} · margen de contribución {Math.round(r.margin * 1000) / 10} % ·{" "}
                  {be == null ? "sin margen" : r.covered ? `+${money(r.revenueCents - be)} sobre el equilibrio` : `faltan ${money(be - r.revenueCents)}`}
                </small>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.scroll} key="prod">
          <table className={s.tb}>
            <thead>
              <tr>
                <th>Producto</th>
                <th className={s.r}>Vendido</th>
                <th className={s.r}>Margen</th>
                <th className={s.r}>Equilibrio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.category} className={`${s.a} ${s.fadeUp}`} style={{ ["--i" as string]: i }}>
                  <td>
                    <b>{r.category}</b>
                  </td>
                  <td className={s.r}>{money(r.revenueCents)}</td>
                  <td className={s.r}>{Math.round(r.margin * 100)} %</td>
                  <td className={s.r}>{r.breakevenCents != null ? money(r.breakevenCents) : "—"}</td>
                  <td>
                    <span className={s.pill} data-tone={r.covered ? "ok" : "bad"}>
                      {r.breakevenCents == null ? "Sin margen" : r.covered ? `+${money(r.revenueCents - r.breakevenCents)}` : `Faltan ${money(r.breakevenCents - r.revenueCents)}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={s.note}>
        Los gastos del periodo ({money(expensesCents)}) se reparten según el peso de cada {view === "cat" ? "categoría" : "producto"} en las ventas; el margen descuenta el costo de lo vendido.
        {view === "prod" ? " Se muestran los 15 productos que más venden." : ""}
      </p>
    </StatsCard>
  );
}

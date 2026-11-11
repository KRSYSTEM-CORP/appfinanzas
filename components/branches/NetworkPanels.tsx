"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightLeftIcon, TruckIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatCurrencyCents } from "@/lib/currencies";
import type { BranchSummary } from "@/lib/actions/branches";
import type { TransferRow, TransferSuggestion } from "@/lib/actions/transfers";

const ORDERS = [
  { id: "sales", label: "Ventas" },
  { id: "profit", label: "Ganancia" },
  { id: "margin", label: "Margen" },
  { id: "avg", label: "Venta promedio" },
] as const;
type Order = (typeof ORDERS)[number]["id"];
const BAR_COLORS = ["bg-primary", "bg-success", "bg-warning", "bg-destructive"];

const card = "flex flex-col gap-3 rounded-[20px] bg-card p-5 shadow-(--shadow-card)";

// Comparativa entre sedes: barras ordenables + tabla con el desglose y el total de la red.
export function BranchComparison({ summaries, currency }: { summaries: BranchSummary[]; currency: string }) {
  const [order, setOrder] = useState<Order>("sales");
  const rows = summaries
    .filter((s) => s.isActive)
    .map((s) => ({
      s,
      margin: s.salesMonthCents > 0 ? (s.profitMonthCents / s.salesMonthCents) * 100 : 0,
      avg: s.salesMonth > 0 ? s.salesMonthCents / s.salesMonth : 0,
    }));
  const value = (r: (typeof rows)[number]) =>
    order === "sales" ? r.s.salesMonthCents : order === "profit" ? r.s.profitMonthCents : order === "margin" ? r.margin : r.avg;
  const fmt = (n: number) => (order === "margin" ? `${n.toFixed(1)} %` : formatCurrencyCents(currency, Math.round(n)));
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const max = Math.max(1, ...sorted.map((r) => Math.abs(value(r))));
  const total = rows.reduce(
    (t, r) => ({
      sales: t.sales + r.s.salesMonthCents,
      cogs: t.cogs + r.s.cogsMonthCents,
      exp: t.exp + r.s.expensesMonthCents,
      com: t.com + r.s.commissionsMonthCents,
      profit: t.profit + r.s.profitMonthCents,
    }),
    { sales: 0, cogs: 0, exp: 0, com: 0, profit: 0 }
  );
  const c = (n: number) => formatCurrencyCents(currency, n);

  return (
    <section className={card}>
      <div>
        <h2 className="text-base font-bold">Comparativa entre sedes</h2>
        <p className="text-xs text-muted-foreground">Ventas, costo, gastos, comisiones y ganancia neta estimada del mes por sede</p>
      </div>
      <div role="group" aria-label="Ordenar comparativa" className="flex flex-wrap gap-2">
        {ORDERS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={order === o.id}
            onClick={() => setOrder(o.id)}
            className={`min-h-9 rounded-full px-3.5 text-[13px] font-bold ${order === o.id ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {sorted.map((r, i) => (
          <li key={r.s.id} className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: "minmax(0,7rem) 1fr auto" }}>
            <span className="truncate font-semibold">{i === 0 && value(r) > 0 ? "★ " : ""}{r.s.name}</span>
            <span className="h-3 overflow-hidden rounded-full bg-muted">
              <span className={`block h-full rounded-full ${BAR_COLORS[i % 4]}`} style={{ width: `${Math.max(0, (value(r) / max) * 100)}%` }} />
            </span>
            <span className="tabular-nums text-xs text-muted-foreground">{fmt(value(r))}</span>
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-2 font-semibold">Sede</th>
              <th className="px-2 text-right font-semibold">Ventas</th>
              <th className="px-2 text-right font-semibold">Costo</th>
              <th className="px-2 text-right font-semibold">Gastos</th>
              <th className="px-2 text-right font-semibold">Comisiones</th>
              <th className="px-2 text-right font-semibold">Ganancia neta</th>
              <th className="pl-2 text-right font-semibold">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sorted.map((r) => (
              <tr key={r.s.id}>
                <td className="py-2 pr-2 font-semibold">{r.s.name}</td>
                <td className="px-2 text-right tabular-nums">{c(r.s.salesMonthCents)}</td>
                <td className="px-2 text-right tabular-nums">{c(r.s.cogsMonthCents)}</td>
                <td className="px-2 text-right tabular-nums">{c(r.s.expensesMonthCents)}</td>
                <td className="px-2 text-right tabular-nums">{c(r.s.commissionsMonthCents)}</td>
                <td className={`px-2 text-right font-bold tabular-nums ${r.s.profitMonthCents < 0 ? "text-destructive" : "text-success"}`}>{c(r.s.profitMonthCents)}</td>
                <td className="pl-2 text-right tabular-nums">{r.margin.toFixed(1)} %</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-bold">
              <td className="py-2 pr-2">Red completa</td>
              <td className="px-2 text-right tabular-nums">{c(total.sales)}</td>
              <td className="px-2 text-right tabular-nums">{c(total.cogs)}</td>
              <td className="px-2 text-right tabular-nums">{c(total.exp)}</td>
              <td className="px-2 text-right tabular-nums">{c(total.com)}</td>
              <td className="px-2 text-right tabular-nums">{c(total.profit)}</td>
              <td className="pl-2 text-right tabular-nums">{total.sales > 0 ? ((total.profit / total.sales) * 100).toFixed(1) : "0.0"} %</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

// Traspasos entre sedes: sugerencias automáticas y los últimos movimientos.
export function BranchTransfersCard({ suggestions, transfers }: { suggestions: TransferSuggestion[]; transfers: TransferRow[] }) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Traspasos entre sedes</h2>
          <p className="text-xs text-muted-foreground">Mueve mercancía de donde sobra a donde falta</p>
        </div>
        <Link href="/inventory/transfers" className={buttonVariants({ size: "sm" })}>
          <TruckIcon /> Crear traspaso
        </Link>
      </div>
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">KR POS te sugiere</h3>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin sugerencias: el stock de la red está equilibrado.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {suggestions.map((s) => (
            <li key={`${s.productName}-${s.fromBranchName}-${s.toBranchName}`} className="py-2.5 text-sm">
              <p className="font-semibold">{s.quantity} × {s.productName}</p>
              <p className="text-xs text-muted-foreground">{s.fromBranchName} → {s.toBranchName} · {s.reason}</p>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Últimos traspasos</h3>
      {transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay traspasos.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {transfers.slice(0, 5).map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {t.items.map((i) => `${i.quantity} × ${i.productName}`).join(", ")}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t.fromBranchName} <ArrowRightLeftIcon className="size-3" aria-hidden /> {t.toBranchName} · {new Date(t.createdAt).toLocaleDateString("es-VE")}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-success/14 px-2.5 py-0.5 text-xs font-semibold text-success">Recibido</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Reglas de la red: cómo se comparten catálogo, stock y precios (lo que el sistema hace hoy).
export function BranchRulesCard({ exchangeRateEnabled }: { exchangeRateEnabled: boolean }) {
  const rules = [
    { t: "Inventario por sede", d: "Cada sede lleva su propio stock. Para mover mercancía entre sedes se usa un traspaso." },
    { t: "Catálogo y precios", d: "Cada sede mantiene su catálogo y sus precios; un traspaso crea el producto en el destino si no existe." },
    { t: "Tasa del día única", d: exchangeRateEnabled ? "La misma tasa aplica a todas las sedes de la empresa." : "La empresa trabaja sin tasa de cambio." },
    { t: "Caja y documentos propios", d: "Cada sede conserva su caja, su Corte Z y su numeración de documentos." },
  ];
  return (
    <section className={card}>
      <div>
        <h2 className="text-base font-bold">Reglas de la red</h2>
        <p className="text-xs text-muted-foreground">Cómo se comparten catálogo, stock y precios</p>
      </div>
      <ul className="flex flex-col divide-y">
        {rules.map((r) => (
          <li key={r.t} className="py-2.5 text-sm">
            <p className="font-semibold">{r.t}</p>
            <p className="text-xs text-muted-foreground">{r.d}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

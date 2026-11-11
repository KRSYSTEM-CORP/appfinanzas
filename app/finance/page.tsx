import Link from "next/link";
import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { ClockIcon, PackageIcon, TrendingUpIcon, WalletIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reports/StatCard";
import { SalesByDayChart } from "@/components/reports/SalesByDayChart";
import { TopProductsChart } from "@/components/reports/TopProductsChart";
import { BottomProductsChart } from "@/components/reports/BottomProductsChart";
import { ExpensesPanel } from "@/components/finance/ExpensesPanel";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import {
  revenueTotals,
  receivablesTotals,
  salesByDay,
  topProducts,
  bottomProducts,
  incomeByCurrency,
  revenueComparison,
  salesByPaymentMethod,
  mostPurchasedProducts,
  inventoryRotation,
  customerMix,
  restockSuggestions,
  periodExtras,
  weeklyReports,
  getWeeklyReportEnabled,
} from "@/lib/actions/reports";
import { salesHeatmap } from "@/lib/actions/home";
import { commissionsTotal, sellersSalesOverview } from "@/lib/actions/seller-reports";
import { costOfGoodsSold, expensesTotal, listExpenses, categoryMargins, productMargins, getProfitGoal } from "@/lib/actions/finance";
import { WeeklyReportToggle } from "@/components/finance/WeeklyReportToggle";
import { BreakevenCard } from "@/components/finance/BreakevenCard";
import { StatsInsights } from "@/components/finance/StatsInsights";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; q?: string }>;
}) {
  await requirePermission("stats");
  await requireAccountingPlan();
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "7d" });
  const expenseSearch = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const [
    totals,
    receivables,
    byDay,
    top,
    bottom,
    currencyIncome,
    cogsCents,
    expensesCents,
    commissionsCents,
    expenses,
    comparison,
    categories,
    products,
    paymentMix,
    purchased,
    rotation,
    goalCents,
    sellers,
    heat,
    mix,
    restock,
    extras,
    weekly,
    weeklyOn,
    { localCurrencyCode, exchangeRateEnabled, referenceCurrency, rate },
  ] = await Promise.all([
    revenueTotals(range),
    receivablesTotals(),
    salesByDay(range),
    topProducts(range),
    bottomProducts(range),
    incomeByCurrency(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    commissionsTotal(range),
    listExpenses(range, expenseSearch),
    revenueComparison(range),
    categoryMargins(range),
    productMargins(range),
    salesByPaymentMethod(range),
    mostPurchasedProducts(range),
    inventoryRotation(range),
    getProfitGoal(),
    sellersSalesOverview(range),
    salesHeatmap(),
    customerMix(range),
    restockSuggestions(),
    periodExtras(range),
    weeklyReports(),
    getWeeklyReportEnabled(),
    getExchangeRateInfo(),
  ]);

  // Variación contra el periodo anterior (solo si hay base para comparar).
  const pctDelta = (cur: number, prev: number) =>
    extras && prev > 0 ? { pct: Math.round(((cur - prev) / prev) * 100), label: extras.label } : undefined;
  const avgDelta = extras && extras.prevCount > 0 && totals.count > 0 ? pctDelta(totals.avgEurCents, extras.prevAvgCents) : undefined;
  const countDelta = extras ? pctDelta(totals.count, extras.prevCount) : undefined;
  const expensesDelta = extras ? (() => { const d = pctDelta(expensesCents, extras.prevExpensesCents); return d ? { ...d, inverse: true } : undefined; })() : undefined;

  const netProfitCents = totals.totalEurCents - cogsCents - expensesCents - commissionsCents;

  // Only shown when both periods have at least one closed day and a baseline
  // to compare against — otherwise a percentage would be noise.
  const revenueDelta =
    comparison && comparison.currentDays > 0 && comparison.previousDays > 0 && comparison.previousCents > 0
      ? {
          pct: Math.round(((comparison.currentCents - comparison.previousCents) / comparison.previousCents) * 100),
          label: comparison.label,
          note:
            comparison.currentDays !== comparison.previousDays
              ? `${comparison.currentDays} vs ${comparison.previousDays} días con cierre de caja`
              : undefined,
        }
      : undefined;

  function currencyDisplayName(code: string): string {
    if (code === "EUR" || code === "USD") return code;
    return code;
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="kr-eyebrow">Qué está pasando en tu tienda</p>
          <h1 className="kr-h1">Estadísticas</h1>
        </div>
        <DateRangeSwitcher selection={range} extraParams={expenseSearch ? { q: expenseSearch } : undefined} />
      </div>

      {(revenueDelta || avgDelta || expensesDelta) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { name: "Ventas", d: revenueDelta, inverse: false },
            { name: "Venta promedio", d: avgDelta, inverse: false },
            { name: "Gastos", d: expensesDelta, inverse: true },
          ]
            .filter((x) => x.d)
            .map((x) => {
              const good = (x.d!.pct >= 0) !== x.inverse;
              return (
                <span key={x.name} className={`rounded-full px-4 py-3 text-center text-sm font-bold ${good ? "bg-success/14 text-success" : "bg-destructive/12 text-destructive"}`}>
                  {x.name} {x.d!.pct > 0 ? "+" : x.d!.pct < 0 ? "−" : ""}{Math.abs(x.d!.pct)} % {x.d!.label}
                </span>
              );
            })}
        </div>
      )}

      <div className="stat-grid grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:rounded-[20px] [&>*]:bg-card [&>*]:p-5 [&>*]:shadow-(--shadow-card) xl:grid-cols-5">
        <StatCard
          label="Ingresos totales"
          accent="primary"
          delta={revenueDelta}
          icon={TrendingUpIcon}
          value={
            <div className="flex flex-col">
              <span>
                {exchangeRateEnabled
                  ? formatLocalCurrency(totals.totalVES, localCurrencyCode)
                  : formatCurrencyCents(referenceCurrency, totals.totalEurCents)}
              </span>
              {exchangeRateEnabled && (
                <span className="text-xs text-muted-foreground font-normal">
                  {formatCurrencyCents(referenceCurrency, totals.totalEurCents)}
                </span>
              )}
            </div>
          }
        />
        <StatCard
          label={`Por cobrar (${receivables.count})`}
          href="/customers/receivables"
          accent="warning"
          icon={ClockIcon}
          value={
            <div className="flex flex-col">
              <span className={receivables.count > 0 ? "text-destructive" : undefined}>
                {exchangeRateEnabled
                  ? formatLocalCurrency(receivables.totalVES, localCurrencyCode)
                  : formatCurrencyCents(referenceCurrency, receivables.totalEurCents)}
              </span>
              {exchangeRateEnabled && (
                <span className="text-xs text-muted-foreground font-normal">
                  {formatCurrencyCents(referenceCurrency, receivables.totalEurCents)}
                </span>
              )}
            </div>
          }
        />
        <StatCard
          label="Costo de mercancía vendida"
          accent="violet"
          icon={PackageIcon}
          value={formatCurrencyCents(referenceCurrency, cogsCents)}
        />
        <StatCard
          label="Gastos totales"
          accent="destructive"
          delta={expensesDelta}
          icon={WalletIcon}
          value={formatCurrencyCents(referenceCurrency, expensesCents)}
        />
        <StatCard
          label="Comisiones de vendedores"
          accent="warning"
          icon={WalletIcon}
          value={formatCurrencyCents(referenceCurrency, commissionsCents)}
        />
      </div>

      <div className="stat-grid grid grid-cols-1 gap-4 sm:grid-cols-2 [&>*]:rounded-[20px] [&>*]:bg-card [&>*]:p-5 [&>*]:shadow-(--shadow-card) xl:grid-cols-4">
        <StatCard label="Pedidos" accent="primary" icon={TrendingUpIcon} value={String(totals.count)} delta={countDelta} />
        <StatCard
          label="Venta promedio"
          accent="violet"
          delta={avgDelta}
          icon={WalletIcon}
          value={formatCurrencyCents(referenceCurrency, totals.avgEurCents)}
        />
        <StatCard
          label="Clientes nuevos"
          accent="success"
          icon={TrendingUpIcon}
          value={String(mix.newCount)}
        />
        <StatCard
          label="Margen bruto"
          accent="warning"
          icon={PackageIcon}
          value={`${totals.totalEurCents > 0 ? Math.round(((totals.totalEurCents - cogsCents) / totals.totalEurCents) * 100) : 0} %`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ganancia neta estimada</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-3xl font-semibold ${netProfitCents < 0 ? "text-destructive" : "text-success"}`}>
            {formatCurrencyCents(referenceCurrency, netProfitCents)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Ingresos − costo de mercancía vendida − gastos − comisiones, para el período seleccionado.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cascada de utilidad</CardTitle>
          <p className="text-sm text-muted-foreground">De las ventas a la ganancia neta, paso a paso</p>
        </CardHeader>
        <CardContent>
          {totals.totalEurCents <= 0 ? (
            <p className="text-sm text-muted-foreground">Sin ventas en este período.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {[
                { label: "Ventas", value: totals.totalEurCents, from: 0, color: "bg-primary", sign: "" },
                { label: "Costo de mercancía", value: cogsCents, from: totals.totalEurCents - cogsCents, color: "bg-[#ff9f0a]", sign: "−" },
                { label: "Gastos", value: expensesCents, from: totals.totalEurCents - cogsCents - expensesCents, color: "bg-destructive", sign: "−" },
                { label: "Comisiones", value: commissionsCents, from: totals.totalEurCents - cogsCents - expensesCents - commissionsCents, color: "bg-[#c0577a]", sign: "−" },
                { label: "Utilidad", value: Math.abs(netProfitCents), from: 0, color: netProfitCents < 0 ? "bg-destructive" : "bg-success", sign: netProfitCents < 0 ? "−" : "" },
              ].map((r) => {
                const total = totals.totalEurCents;
                const left = Math.max(0, Math.min(100, (r.from / total) * 100));
                const width = Math.max(r.value > 0 ? 1.5 : 0, Math.min(100 - left, (r.value / total) * 100));
                return (
                  <li key={r.label} className="grid grid-cols-[130px_1fr_110px] items-center gap-3 text-sm">
                    <span className="font-medium">{r.label}</span>
                    <div className="relative h-3 rounded-full bg-muted">
                      <div className={`absolute top-0 h-full rounded-full ${r.color}`} style={{ left: `${left}%`, width: `${width}%` }} />
                    </div>
                    <span className="text-right font-semibold tabular-nums">{r.sign}{formatCurrencyCents(referenceCurrency, r.value)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mapa de calor de ventas</CardTitle>
          <p className="text-sm text-muted-foreground">Ventas por día y hora (8 a 20 h) · últimas 8 semanas</p>
        </CardHeader>
        <CardContent>
          {(() => {
            const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
            const hours = Array.from({ length: 13 }, (_, i) => i + 8);
            const byKey = new Map(heat.map((c) => [`${c.dow}-${c.hour}`, c.count]));
            const max = Math.max(0, ...heat.map((c) => c.count));
            if (max === 0) return <p className="text-sm text-muted-foreground">Aún no hay suficientes ventas para el mapa.</p>;
            const top = [...heat].sort((a, b) => b.count - a.count)[0];
            return (
              <div className="flex flex-col gap-3">
                <div className="overflow-x-auto">
                  <div className="grid min-w-[560px] gap-1" style={{ gridTemplateColumns: `40px repeat(${hours.length}, minmax(0, 1fr))` }} role="grid" aria-label="Mapa de calor de ventas por día y hora">
                    <span />
                    {hours.map((h) => (
                      <span key={h} className="text-center text-[11px] text-muted-foreground">{h}</span>
                    ))}
                    {days.map((d, di) => (
                      <div key={d} className="contents">
                        <span className="self-center text-xs font-medium text-muted-foreground">{d}</span>
                        {hours.map((h) => {
                          const n = byKey.get(`${di}-${h}`) ?? 0;
                          const a = n === 0 ? 0 : 0.15 + 0.85 * (n / max);
                          return (
                            <span
                              key={h}
                              title={`${d} ${h}:00 · ${n} ventas`}
                              className="h-7 rounded-md bg-muted"
                              style={n > 0 ? { background: `color-mix(in oklab, var(--primary) ${Math.round(a * 100)}%, transparent)` } : undefined}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  El pico está el {["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][top.dow]} a las {top.hour}:00 ({top.count} ventas en 8 semanas).
                </p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          {
            title: "Ventas por categoría",
            sub: "Lo vendido en el período, por categoría",
            rows: [...categories].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 8).map((c) => ({ label: c.category, cents: c.revenueCents })),
          },
          {
            title: "Ventas por vendedor",
            sub: "Quién vendió cuánto en el período",
            rows: sellers.filter((x) => x.totalEurCents > 0).slice(0, 8).map((x) => ({ label: x.name, cents: x.totalEurCents })),
          },
        ].map((b) => {
          const max = Math.max(1, ...b.rows.map((r) => r.cents));
          return (
            <Card key={b.title}>
              <CardHeader>
                <CardTitle>{b.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{b.sub}</p>
              </CardHeader>
              <CardContent>
                {b.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin ventas en este período.</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {b.rows.map((r) => (
                      <li key={r.label} className="grid grid-cols-[110px_1fr_90px] items-center gap-3 text-sm">
                        <span className="truncate font-medium">{r.label}</span>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, Math.round((r.cents / max) * 100))}%` }} />
                        </div>
                        <span className="text-right font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, r.cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clientes nuevos y recurrentes</CardTitle>
          <p className="text-sm text-muted-foreground">
            {mix.total} {mix.total === 1 ? "cliente atendido" : "clientes atendidos"} en el período
          </p>
        </CardHeader>
        <CardContent>
          {mix.total === 0 ? (
            <p className="text-sm text-muted-foreground">Sin clientes en este período.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${mix.newCount} nuevos y ${mix.returningCount} recurrentes`}>
                <div className="bg-primary" style={{ width: `${(mix.newCount / mix.total) * 100}%` }} />
                <div className="bg-success" style={{ width: `${(mix.returningCount / mix.total) * 100}%` }} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <p><span className="mr-2 inline-block size-2.5 rounded-full bg-primary" aria-hidden />Nuevos <b className="tabular-nums">{mix.newCount} · {Math.round((mix.newCount / mix.total) * 1000) / 10} %</b></p>
                <p><span className="mr-2 inline-block size-2.5 rounded-full bg-success" aria-hidden />Recurrentes <b className="tabular-nums">{mix.returningCount} · {Math.round((mix.returningCount / mix.total) * 1000) / 10} %</b></p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reposición sugerida</CardTitle>
          <p className="text-sm text-muted-foreground">Para cubrir 20 días de ventas, según el ritmo de los últimos 30 días</p>
        </CardHeader>
        <CardContent>
          {restock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada por reponer: tu stock cubre el ritmo actual.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col divide-y">
                {restock.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.stock <= 0 ? "Agotado" : `Quedan ${r.stock}${r.daysLeft != null ? ` · alcanza para ${r.daysLeft} ${r.daysLeft === 1 ? "día" : "días"}` : ""}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">Pedir {r.suggestedQty} und.</p>
                      {r.estimatedCostCents != null && (
                        <p className="text-xs text-muted-foreground tabular-nums">{formatCurrencyCents(referenceCurrency, r.estimatedCostCents)}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <Link href="/purchases/new" className="text-sm font-semibold text-primary underline underline-offset-4">
                Crear orden de compra con estos productos
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rendimiento de productos</CardTitle>
          <p className="text-sm text-muted-foreground">Pareto 80/20: qué productos generan la mayor parte de la venta</p>
        </CardHeader>
        <CardContent>
          {(() => {
            const items = [...top].sort((a, b) => b.revenueCents - a.revenueCents);
            const total = items.reduce((t, i) => t + i.revenueCents, 0);
            if (items.length === 0 || total <= 0) return <p className="text-sm text-muted-foreground">Sin ventas de productos en este período.</p>;
            const rows = items.map((i, idx) => {
              const before = items.slice(0, idx).reduce((t, x) => t + x.revenueCents, 0);
              return { ...i, before, cum: Math.round(((before + i.revenueCents) / total) * 100) };
            });
            const classA = rows.filter((r) => r.before < total * 0.8).length;
            const max = items[0].revenueCents;
            return (
              <div className="flex flex-col gap-3">
                <ul className="flex flex-col gap-2.5">
                  {rows.map((r) => (
                    <li key={`${r.productId}-${r.productName}`} className="grid grid-cols-[130px_1fr_84px_44px] items-center gap-3 text-sm">
                      <span className="truncate font-medium">{r.productName}</span>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${r.before < total * 0.8 ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${Math.max(2, Math.round((r.revenueCents / max) * 100))}%` }} />
                      </div>
                      <span className="text-right font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, r.revenueCents)}</span>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">{r.cum} %</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">
                  Los primeros {classA} {classA === 1 ? "producto genera" : "productos generan"} el 80 % de la venta (clase A). Cuídalos de agotarse.
                </p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lo que dicen tus números</CardTitle>
          <p className="text-sm text-muted-foreground">Hallazgos automáticos</p>
        </CardHeader>
        <CardContent>
          {(() => {
            const days = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
            const findings: { text: string; href?: string; cta?: string }[] = [];
            const peak = [...heat].sort((a, b) => b.count - a.count)[0];
            if (peak && peak.count > 0) findings.push({ text: `Tu hora más fuerte es el ${days[peak.dow]} a las ${peak.hour}:00 (${peak.count} ventas en 8 semanas): refuerza el personal.` });
            if (restock[0]) findings.push({ text: `${restock[0].name} ${restock[0].stock <= 0 ? "está agotado" : `tiene ${restock[0].stock}`} y se vende bien: repón pronto.`, href: "/purchases/new", cta: "Crear orden de compra" });
            const totalMix = paymentMix.reduce((t, m) => t + m.totalCents, 0);
            if (totalMix > 0 && paymentMix[0]) findings.push({ text: `${Math.round((paymentMix[0].totalCents / totalMix) * 100)} % de tus cobros llega por ${paymentMix[0].method}.` });
            if (receivables.count > 0) findings.push({ text: `Tienes ${receivables.count} ${receivables.count === 1 ? "venta a crédito" : "ventas a crédito"} por cobrar.`, href: "/customers/receivables", cta: "Ver cuentas por cobrar" });
            if (findings.length === 0) return <p className="text-sm text-muted-foreground">Aún no hay suficientes datos para hallazgos.</p>;
            return (
              <ul className="flex flex-col divide-y">
                {findings.map((f) => (
                  <li key={f.text} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span>{f.text}</span>
                    {f.href && (
                      <Link href={f.href} className="shrink-0 rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
                        {f.cta}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reporte semanal</CardTitle>
          <p className="text-sm text-muted-foreground">Las últimas 4 semanas (lunes a domingo). Toca «Ver reporte» para abrir Estadísticas de esa semana.</p>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <WeeklyReportToggle initial={weeklyOn} />
          </div>
          <ul className="flex flex-col divide-y">
            {weekly.map((w) => (
              <li key={w.from} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">Semana del {w.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Ventas {formatCurrencyCents(referenceCurrency, w.cents)} · {w.count} {w.count === 1 ? "pedido" : "pedidos"}
                  </p>
                </div>
                <Link href={`/finance?range=range&from=${w.from}&to=${w.to}`} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">
                  Ver reporte
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <StatsInsights mix={paymentMix} purchased={purchased} rotation={rotation} referenceCurrency={referenceCurrency} />

      <BreakevenCard
        revenueCents={totals.totalEurCents}
        cogsCents={cogsCents}
        expensesCents={expensesCents + commissionsCents}
        categories={categories}
        products={products}
        goalCents={goalCents}
        referenceCurrency={referenceCurrency}
      />

      <Card>
        <CardHeader>
          <CardTitle>Ingresos por moneda</CardTitle>
        </CardHeader>
        <CardContent>
          {currencyIncome.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin ingresos en este período.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {currencyIncome.map((row) => (
                <div key={row.currencyCode} className="rounded-lg border bg-card shadow-xs p-3">
                  <p className="text-xs text-muted-foreground">{currencyDisplayName(row.currencyCode)}</p>
                  <p className="text-lg font-semibold">
                    {formatCurrencyCents(row.currencyCode, row.totalCents)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por día</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesByDayChart
              data={byDay}
              currencyCode={localCurrencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Más vendidos</CardTitle>
            <p className="text-sm text-muted-foreground">Unidades vendidas en el período</p>
          </CardHeader>
          <CardContent>
            <TopProductsChart data={top} />
            {top[0] && (
              <p className="mt-3 text-sm text-muted-foreground">
                Líder: <b className="text-foreground">{top[0].productName}</b> con {formatCurrencyCents(referenceCurrency, top[0].revenueCents)} en ventas.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Menos vendidos</CardTitle>
            <p className="text-sm text-muted-foreground">Los que menos se mueven · candidatos a promoción</p>
          </CardHeader>
          <CardContent>
            <BottomProductsChart data={bottom} />
            {bottom[0] && (
              <p className="mt-3 text-sm text-muted-foreground">
                <b className="text-foreground">{bottom[0].productName}</b> vendió {bottom[0].quantity} {bottom[0].quantity === 1 ? "unidad" : "unidades"}: prueba un descuento o combo.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gastos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Historial del período seleccionado. Usa los filtros superiores para ver hoy, los últimos 7 días, este mes o meses específicos.
          </p>
        </CardHeader>
        <CardContent>
          <ExpensesPanel
            expenses={expenses.map((e) => ({ ...e, exchangeRate: e.exchangeRate == null ? null : Number(e.exchangeRate) }))}
            referenceCurrency={referenceCurrency}
            localCurrencyCode={localCurrencyCode}
            rate={exchangeRateEnabled && rate != null && rate > 0 ? rate : null}
            searchQuery={expenseSearch}
          />
        </CardContent>
      </Card>
    </div>
  );
}

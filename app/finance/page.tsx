import Link from "next/link";
import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { LightbulbIcon, ShoppingCartIcon, TrendingDownIcon, TrendingUpIcon, WalletIcon } from "lucide-react";
import { ExpensesPanel } from "@/components/finance/ExpensesPanel";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
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
  ticketDistribution,
} from "@/lib/actions/reports";
import { salesHeatmap } from "@/lib/actions/home";
import { commissionsTotal, sellersSalesOverview } from "@/lib/actions/seller-reports";
import { costOfGoodsSold, expensesTotal, listExpenses, categoryMargins, productMargins, getProfitGoal } from "@/lib/actions/finance";
import { WeeklyReportToggle } from "@/components/finance/WeeklyReportToggle";
import { BreakevenBreakdownCard, BreakevenCard } from "@/components/finance/BreakevenCard";
import { ProductMarginsCard } from "@/components/finance/ProductMarginsCard";
import { StatsInsights } from "@/components/finance/StatsInsights";
import { HBars, Kpi, Reveal, Stack, StatsCard } from "@/components/finance/StatsUi";
import s from "@/components/finance/stats.module.css";
import { WaterfallChart } from "@/components/reports/WaterfallChart";
import { ParetoChart } from "@/components/reports/ParetoChart";
import { TicketHistogramChart } from "@/components/reports/TicketHistogramChart";
import { SalesRhythmChart } from "@/components/reports/SalesRhythmChart";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection, selectionToWindows, SHOP_TIME_ZONE, zonedDateParts } from "@/lib/report-types";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { PaymentMethod } from "@prisma/client";
import {
  WEEKDAYS,
  currencySymbol,
  deltaPct,
  hourLabel,
  hourTotals,
  monthProjection,
  peakWindow,
  percentOf,
  periodDays,
  periodLabel,
  signedPct,
  weekdayTotals,
} from "@/lib/stats-view";

export const dynamic = "force-dynamic";

const CAT_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string; q?: string }>;
}) {
  await requirePermission("stats");
  await requireAccountingPlan();
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
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
    tickets,
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
    ticketDistribution(range),
    getExchangeRateInfo(),
  ]);

  const cur = referenceCurrency as string;
  const money = (c: number) => formatCurrencyCents(cur, c);
  const today = zonedDateParts(new Date(), SHOP_TIME_ZONE);
  const label = periodLabel(range, today);
  const isMonth = range.kind === "preset" && range.preset === "month";
  const days = periodDays(selectionToWindows(range));

  // Variación contra el periodo anterior (solo con base para comparar). Ventas
  // compara días con cierre de caja en ambos lados, como antes.
  const revenuePct =
    comparison && comparison.currentDays > 0 && comparison.previousDays > 0 ? deltaPct(comparison.currentCents, comparison.previousCents) : null;
  const avgPct = extras && extras.prevCount > 0 && totals.count > 0 ? deltaPct(totals.avgEurCents, extras.prevAvgCents) : null;
  const expensesPct = extras ? deltaPct(expensesCents, extras.prevExpensesCents) : null;
  const chips = [
    { name: "Ventas", pct: revenuePct, inverse: false },
    { name: "Venta promedio", pct: avgPct, inverse: false },
    { name: "Gastos", pct: expensesPct, inverse: true },
  ].filter((x): x is { name: string; pct: number; inverse: boolean } => x.pct != null);

  // Hallazgos automáticos (solo con datos reales).
  const hours = hourTotals(heat);
  const peak = peakWindow(hours);
  const wk = weekdayTotals(heat);
  const wkPeak = wk.some((v) => v > 0) ? wk.indexOf(Math.max(...wk)) : -1;
  const totalMix = paymentMix.reduce((t, m) => t + m.totalCents, 0);
  const findings: { icon: typeof LightbulbIcon; text: string; href?: string; cta?: string }[] = [];
  if (peak && wkPeak >= 0)
    findings.push({
      icon: LightbulbIcon,
      text: `Los ${WEEKDAYS[wkPeak].toLowerCase()} son tu día más fuerte y de ${hourLabel(peak.start)} a ${hourLabel(peak.end)} vendes ${peak.ratio.toLocaleString("es-VE", { maximumFractionDigits: 1 })} veces el promedio: refuerza el personal.`,
    });
  if (restock[0])
    findings.push({
      icon: TrendingDownIcon,
      text: `${restock[0].name} ${restock[0].stock <= 0 ? "está agotado" : `tiene ${restock[0].stock}`} y se vende bien: repón pronto.`,
      href: "/purchases/new",
      cta: "Crear orden de compra",
    });
  if (totalMix > 0 && paymentMix[0])
    findings.push({
      icon: TrendingUpIcon,
      text: `${PAYMENT_METHOD_LABELS[paymentMix[0].method as PaymentMethod] ?? paymentMix[0].method} ya suma ${Math.round((paymentMix[0].totalCents / totalMix) * 100)} % de tus cobros.`,
    });
  if (receivables.count > 0)
    findings.push({
      icon: WalletIcon,
      text: `Tienes ${receivables.count} ${receivables.count === 1 ? "venta a crédito" : "ventas a crédito"} por cobrar (${money(receivables.totalEurCents)}).`,
      href: "/customers/receivables",
      cta: "Ver cuentas por cobrar",
    });

  const catRows = [...categories].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5);
  const catTotal = catRows.reduce((t, c) => t + c.revenueCents, 0);
  const sellerRows = sellers.filter((x) => x.totalEurCents > 0).slice(0, 8);
  const sellerTotal = sellerRows.reduce((t, x) => t + x.totalEurCents, 0);

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <p className="kr-eyebrow">Qué está pasando en tu tienda</p>
          <h1 className="kr-h1">Estadísticas</h1>
        </div>
        <PeriodBar label={label}>
          <DateRangeSwitcher selection={range} extraParams={expenseSearch ? { q: expenseSearch } : undefined} />
        </PeriodBar>
      </header>

      {chips.length > 0 && (
        <Reveal className={s.trio}>
          {chips.map((c, i) => {
            const good = c.pct === 0 || (c.pct > 0) !== c.inverse;
            return (
              <span key={c.name} className={`${s.pill} ${s.a} ${s.fadeUp}`} data-tone={good ? "ok" : "bad"} style={{ ["--i" as string]: i }}>
                {c.name} {signedPct(c.pct)} vs. periodo anterior
              </span>
            );
          })}
        </Reveal>
      )}

      <div className={`${s.kpis} ${s.kp3}`}>
        <Kpi
          index={0}
          tone="all"
          icon="money"
          label="Ventas"
          value={totals.totalEurCents}
          format={{ kind: "money", currency: cur }}
          hint={exchangeRateEnabled ? `Total cobrado · ${formatLocalCurrency(totals.totalVES, localCurrencyCode)}` : "Total cobrado"}
          spark={byDay.map((d) => d.totalEurCents)}
        />
        <Kpi index={1} tone="warn" icon="stats" label="Venta promedio" value={totals.avgEurCents} format={{ kind: "money", currency: cur }} hint="Por venta" />
        <Kpi index={2} tone="bad" icon="down" label="Gastos" value={expensesCents} format={{ kind: "money", currency: cur }} hint="Del periodo" />
      </div>
      <div className={`${s.kpis} ${s.kp2}`}>
        <Kpi index={3} tone="ok" icon="cart" label="Pedidos" value={totals.count} format={{ kind: "int" }} hint="Ventas pagadas" spark={byDay.map((d) => d.count)} />
        <Kpi index={4} tone="ok" icon="star" label="Clientes nuevos" value={mix.newCount} format={{ kind: "int" }} hint="Primera compra" />
      </div>

      <StatsCard title="Ritmo de ventas" sub={`Ventas por día · ${label} · días y horas fuertes de las últimas 8 semanas`}>
        <SalesRhythmChart byDay={byDay} heat={heat} currency={cur} />
        {peak && wkPeak >= 0 && (
          <p className={s.note}>
            Los picos están el {WEEKDAYS[wkPeak].toLowerCase()} y de {hourLabel(peak.start)} a {hourLabel(peak.end)} (
            {peak.ratio.toLocaleString("es-VE", { maximumFractionDigits: 1 })} veces el promedio por hora).
          </p>
        )}
      </StatsCard>

      <div className={`${s.grid} ${s.g2}`}>
        <StatsCard title="Cascada de utilidad" sub="Cómo cada dólar vendido llega a ser utilidad">
          {totals.totalEurCents <= 0 ? (
            <p className={s.empty}>Sin ventas en este período.</p>
          ) : (
            <WaterfallChart
              revenueCents={totals.totalEurCents}
              cogsCents={cogsCents}
              expensesCents={expensesCents}
              commissionsCents={commissionsCents}
              currency={cur}
            />
          )}
        </StatsCard>
        <BreakevenCard
          revenueCents={totals.totalEurCents}
          cogsCents={cogsCents}
          expensesCents={expensesCents + commissionsCents}
          goalCents={goalCents}
          projectionCents={isMonth && totals.totalEurCents > 0 ? monthProjection(totals.totalEurCents, today) : null}
          currency={cur}
        />
      </div>

      <BreakevenBreakdownCard
        revenueCents={totals.totalEurCents}
        expensesCents={expensesCents + commissionsCents}
        categories={categories}
        products={products}
        currency={cur}
      />

      <div className={`${s.grid} ${s.g2}`}>
        <ParetoChart top={top} bottom={bottom} currency={cur} />
        <ProductMarginsCard rows={products} currency={cur} />
      </div>

      <div className={`${s.grid} ${s.g2}`}>
        <StatsCard title="Distribución de ventas" sub={`Ventas por monto de compra · ${label}`}>
          <TicketHistogramChart rows={tickets} symbol={currencySymbol(cur)} />
        </StatsCard>
        <StatsCard title="Ventas por categoría" sub={`${label} · ${money(catTotal)}`}>
          {catRows.length === 0 ? (
            <p className={s.empty}>Sin ventas en este período.</p>
          ) : (
            <>
              <HBars rows={catRows.map((c, i) => ({ label: c.category, value: c.revenueCents, display: money(c.revenueCents), color: CAT_COLORS[i] }))} />
              <div style={{ marginTop: 10 }}>
                <Stack
                  label="Peso de cada categoría en las ventas"
                  parts={catRows.map((c, i) => ({ value: c.revenueCents, color: CAT_COLORS[i], title: `${c.category} · ${percentOf(c.revenueCents, catTotal)} %` }))}
                />
              </div>
            </>
          )}
        </StatsCard>
      </div>

      <div className={`${s.grid} ${s.g2}`}>
        <StatsCard title="Ventas por vendedor" sub={`${money(sellerTotal)} · ${label}`}>
          {sellerRows.length === 0 ? (
            <p className={s.empty}>Sin ventas en este período.</p>
          ) : (
            <HBars rows={sellerRows.map((x) => ({ label: x.name, value: x.totalEurCents, display: money(x.totalEurCents), color: "var(--primary)" }))} />
          )}
        </StatsCard>
        <StatsCard title="Clientes nuevos y recurrentes" sub={`${mix.total} ${mix.total === 1 ? "cliente atendido" : "clientes atendidos"}`}>
          {mix.total === 0 ? (
            <p className={s.empty}>Sin clientes en este período.</p>
          ) : (
            <>
              <Stack
                label={`${mix.newCount} nuevos y ${mix.returningCount} recurrentes`}
                parts={[
                  { value: mix.newCount, color: "var(--chart-3)", title: "Nuevos" },
                  { value: mix.returningCount, color: "var(--chart-1)", title: "Recurrentes" },
                ]}
              />
              {[
                { name: "Nuevos", n: mix.newCount, color: "var(--chart-3)" },
                { name: "Recurrentes", n: mix.returningCount, color: "var(--chart-1)" },
              ].map((r) => (
                <div key={r.name} className={s.li}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span className={s.dot} style={{ background: r.color }} />
                    <b>{r.name}</b>
                  </div>
                  <div className={s.amt}>
                    {r.n} · {percentOf(r.n, mix.total).toLocaleString("es-VE")} %
                  </div>
                </div>
              ))}
            </>
          )}
        </StatsCard>
      </div>

      <StatsInsights purchased={purchased} rotation={rotation} days={days} periodLabel={label} currency={cur} />

      <StatsCard title="Reposición sugerida" sub="Para cubrir 20 días de ventas, según tu ritmo actual">
        {restock.length === 0 ? (
          <p className={s.empty}>Nada por reponer: tu stock cubre el ritmo actual.</p>
        ) : (
          <>
            {restock.map((r, i) => (
              <div key={r.id} className={`${s.li} ${s.a} ${s.fadeUp}`} style={{ ["--i" as string]: i }}>
                <div>
                  <b>{r.name}</b>
                  <small>
                    {r.stock <= 0 ? "Agotado" : `Quedan ${r.stock}${r.daysLeft != null ? ` · alcanza para ${r.daysLeft} ${r.daysLeft === 1 ? "día" : "días"}` : ""}`}
                  </small>
                </div>
                <div className={s.amt}>
                  Pedir {r.suggestedQty} und.
                  {r.estimatedCostCents != null && <small>{money(r.estimatedCostCents)}</small>}
                </div>
              </div>
            ))}
            <Link href="/purchases/new" className={s.btn} data-primary="" style={{ marginTop: 12 }}>
              <ShoppingCartIcon aria-hidden /> Crear orden de compra con estos productos
            </Link>
          </>
        )}
      </StatsCard>

      <StatsCard title="Lo que dicen tus números" sub="Hallazgos automáticos">
        {findings.length === 0 ? (
          <p className={s.empty}>Aún no hay suficientes datos para hallazgos.</p>
        ) : (
          <div className={`${s.grid} ${s.g3}`}>
            {findings.slice(0, 3).map((f, i) => (
              <div key={f.text} className={`${s.find} ${s.a} ${s.fadeUp}`} style={{ ["--i" as string]: i }}>
                <span className={s.fic}>
                  <f.icon aria-hidden />
                </span>
                <p>{f.text}</p>
                {f.href && (
                  <Link href={f.href} className={s.btn}>
                    {f.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </StatsCard>

      <StatsCard title="Reporte semanal automático" sub="Las últimas 4 semanas (lunes a domingo) · toca «Ver reporte» para abrir esa semana">
        <div style={{ marginBottom: 10 }}>
          <WeeklyReportToggle initial={weeklyOn} />
        </div>
        {weekly.map((w) => (
          <div key={w.from} className={s.li}>
            <div>
              <b>Semana del {w.label}</b>
              <small>
                Ventas {money(w.cents)} · {w.count} {w.count === 1 ? "pedido" : "pedidos"}
              </small>
            </div>
            <Link href={`/finance?range=range&from=${w.from}&to=${w.to}`} className={s.btn}>
              Ver reporte
            </Link>
          </div>
        ))}
      </StatsCard>

      <StatsCard title="Ingresos por moneda" sub={`Lo cobrado en cada moneda · ${label}`}>
        {currencyIncome.length === 0 ? (
          <p className={s.empty}>Sin ingresos en este período.</p>
        ) : (
          currencyIncome.map((row) => (
            <div key={row.currencyCode} className={s.li}>
              <b>{row.currencyCode}</b>
              <div className={s.amt}>{formatCurrencyCents(row.currencyCode, row.totalCents)}</div>
            </div>
          ))
        )}
      </StatsCard>

      <StatsCard title="Gastos" sub="Historial del período seleccionado">
        <ExpensesPanel
          expenses={expenses.map((e) => ({ ...e, exchangeRate: e.exchangeRate == null ? null : Number(e.exchangeRate) }))}
          referenceCurrency={referenceCurrency}
          localCurrencyCode={localCurrencyCode}
          rate={exchangeRateEnabled && rate != null && rate > 0 ? rate : null}
          searchQuery={expenseSearch}
        />
      </StatsCard>

    </div>
  );
}

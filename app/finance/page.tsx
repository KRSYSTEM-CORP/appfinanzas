import { requireAccountingPlan } from "@/lib/session";
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
} from "@/lib/actions/reports";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { costOfGoodsSold, expensesTotal, listExpenses, categoryMargins, productMargins, getProfitGoal } from "@/lib/actions/finance";
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
    getExchangeRateInfo(),
  ]);

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
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Lo que vendes y lo que ganas</p>
          <h1 className="text-3xl font-bold tracking-tight">Estadísticas</h1>
        </div>
        <DateRangeSwitcher selection={range} extraParams={expenseSearch ? { q: expenseSearch } : undefined} />
      </div>

      <div className="rounded-lg border bg-card shadow-xs stat-grid divide-y md:divide-y-0 md:divide-x grid grid-cols-1 md:grid-cols-4 [&>*]:p-4">
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
          href="/accounting/receivables"
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

      <Card>
        <div className="rounded-lg border bg-card shadow-xs stat-grid divide-y md:divide-y-0 md:divide-x grid grid-cols-1 md:grid-cols-3">
        <StatCard label="Ventas registradas" accent="primary" icon={TrendingUpIcon} value={String(totals.count)} />
        <StatCard
          label="Venta promedio"
          accent="violet"
          icon={WalletIcon}
          value={formatCurrencyCents(referenceCurrency, totals.avgEurCents)}
        />
        <StatCard
          label="Margen bruto"
          accent="warning"
          icon={PackageIcon}
          value={`${totals.totalEurCents > 0 ? Math.round(((totals.totalEurCents - cogsCents) / totals.totalEurCents) * 100) : 0} %`}
        />
      </div>

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
            <CardTitle>Top productos</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProductsChart data={top} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Productos con menos ventas</CardTitle>
          </CardHeader>
          <CardContent>
            <BottomProductsChart data={bottom} />
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

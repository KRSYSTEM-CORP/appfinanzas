import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reports/StatCard";
import { SalesByDayChart } from "@/components/reports/SalesByDayChart";
import { TopProductsChart } from "@/components/reports/TopProductsChart";
import { BottomProductsChart } from "@/components/reports/BottomProductsChart";
import { ExpensesPanel } from "@/components/finance/ExpensesPanel";
import { formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import {
  revenueTotals,
  receivablesTotals,
  salesByDay,
  topProducts,
  bottomProducts,
  incomeByCurrency,
} from "@/lib/actions/reports";
import { costOfGoodsSold, expensesTotal, listExpenses } from "@/lib/actions/finance";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import type { DateRangePreset } from "@/lib/report-types";

export const dynamic = "force-dynamic";

const presets: { key: DateRangePreset; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
];

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range: DateRangePreset = presets.some((p) => p.key === rawRange)
    ? (rawRange as DateRangePreset)
    : "7d";

  const [
    totals,
    receivables,
    byDay,
    top,
    bottom,
    currencyIncome,
    cogsCents,
    expensesCents,
    expenses,
    { localCurrencyCode, exchangeRateEnabled, referenceCurrency },
  ] = await Promise.all([
    revenueTotals(range),
    receivablesTotals(),
    salesByDay(range),
    topProducts(range),
    bottomProducts(range),
    incomeByCurrency(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    listExpenses(range),
    getExchangeRateInfo(),
  ]);

  const netProfitCents = totals.totalEurCents - cogsCents - expensesCents;

  function currencyDisplayName(code: string): string {
    if (code === "EUR" || code === "USD") return code;
    return code;
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Finanzas</h1>
        <div className="flex gap-1 rounded-lg border p-1">
          {presets.map((p) => (
            <Link
              key={p.key}
              href={`/finance?range=${p.key}`}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                range === p.key
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ingresos totales"
          accent="primary"
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
          accent="warning"
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
          value={formatCurrencyCents(referenceCurrency, cogsCents)}
        />
        <StatCard
          label="Gastos totales"
          accent="destructive"
          value={formatCurrencyCents(referenceCurrency, expensesCents)}
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
            Ingresos − costo de mercancía vendida − gastos, para el período seleccionado.
          </p>
        </CardContent>
      </Card>

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
                <div key={row.currencyCode} className="rounded-lg border p-3">
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
        </CardHeader>
        <CardContent>
          <ExpensesPanel expenses={expenses} referenceCurrency={referenceCurrency} />
        </CardContent>
      </Card>
    </div>
  );
}

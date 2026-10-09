import Link from "next/link";
import {
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BoxesIcon,
  ChartNoAxesCombinedIcon,
  CircleDollarSignIcon,
  PackageIcon,
  ShoppingBagIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/reports/StatCard";
import { SalesByDayChart } from "@/components/reports/SalesByDayChart";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { Price } from "@/components/money/Price";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { listAllProducts } from "@/lib/actions/products";
import { receivablesTotals, revenueComparison, revenueTotals, salesByDay, topProducts } from "@/lib/actions/reports";
import { isLowStock } from "@/lib/inventory";
import { parseDateRangeSelection } from "@/lib/report-types";
import { requireManager } from "@/lib/session";
import { formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";

export const dynamic = "force-dynamic";

function formatPeriodLabel(selection: ReturnType<typeof parseDateRangeSelection>) {
  if (selection.kind === "months") return `${selection.months.length} meses seleccionados`;
  if (selection.preset === "today") return "Hoy";
  if (selection.preset === "7d") return "Últimos 7 días";
  return "Este mes";
}

export default async function BusinessHome({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  const session = await requireManager();
  const range = parseDateRangeSelection(await searchParams, { kind: "preset", preset: "month" });
  const [{ rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency }, products, totals, comparison, dailySales, receivables, bestSellers] =
    await Promise.all([
      getExchangeRateInfo(),
      listAllProducts(),
      revenueTotals(range),
      revenueComparison(range),
      salesByDay(range),
      receivablesTotals(),
      topProducts(range, 5),
    ]);

  const lowStockCount = products.filter((product) => product.isActive && isLowStock(product)).length;
  const activeProductCount = products.filter((product) => product.isActive).length;
  const changePct = comparison && comparison.previousCents > 0
    ? Math.round(((comparison.currentCents - comparison.previousCents) / comparison.previousCents) * 100)
    : null;
  const changeNote = comparison
    ? `Cierres: ${comparison.currentDays} días vs. ${comparison.previousDays} días`
    : undefined;
  const turnover = exchangeRateEnabled
    ? formatLocalCurrency(totals.totalVES, localCurrencyCode)
    : formatCurrencyCents(referenceCurrency, totals.totalEurCents);
  const receivableValue = exchangeRateEnabled
    ? formatLocalCurrency(receivables.totalVES, localCurrencyCode)
    : formatCurrencyCents(referenceCurrency, receivables.totalEurCents);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Panel de gerencia</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Resumen del negocio</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hola, {session.sellerName}. Así marcha tu negocio.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSwitcher selection={range} />
          <Button nativeButton={false} render={<Link href="/pos" />}>
            <ShoppingBagIcon data-icon="inline-start" /> Ir al punto de venta
          </Button>
        </div>
      </header>

      <section aria-label={`Indicadores de ${formatPeriodLabel(range)}`} className="grid grid-cols-2 gap-x-4 gap-y-5 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <StatCard
          label="Ventas registradas"
          value={totals.count.toLocaleString("es-VE")}
          icon={ShoppingBagIcon}
          accent="primary"
          href="/reports"
          delta={changePct == null ? undefined : { pct: changePct, label: "vs. período anterior", note: changeNote }}
        />
        <StatCard
          label={`Ingresos · ${formatPeriodLabel(range).toLowerCase()}`}
          value={<span className="text-xl sm:text-2xl">{turnover}</span>}
          icon={CircleDollarSignIcon}
          accent="success"
          href="/reports"
          delta={changePct == null ? undefined : { pct: changePct, label: "vs. período anterior", note: changeNote }}
        />
        <StatCard
          label="Promedio por venta"
          value={<Price eurCents={totals.avgEurCents} rate={rate} currencyCode={localCurrencyCode} exchangeRateEnabled={exchangeRateEnabled} referenceCurrency={referenceCurrency} />}
          icon={ChartNoAxesCombinedIcon}
          accent="violet"
        />
        <StatCard
          label="Por cobrar"
          value={<span className="text-xl sm:text-2xl">{receivableValue}</span>}
          icon={ArrowDownLeftIcon}
          accent="warning"
          href="/reports?status=CREDIT"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)]">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Tendencia de ventas</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{formatPeriodLabel(range)} · montos de días con cierre de caja</p>
            </div>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/reports" />}>
              Ver reportes <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </CardHeader>
          <CardContent className="min-w-0">
            <SalesByDayChart data={dailySales} currencyCode={localCurrencyCode} exchangeRateEnabled={exchangeRateEnabled} referenceCurrency={referenceCurrency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventario</CardTitle>
            <p className="text-sm text-muted-foreground">Estado del catálogo de productos</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Productos cargados</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{activeProductCount}</p>
              </div>
              <div className={`rounded-xl p-3 ${lowStockCount ? "bg-warning/10" : "bg-muted/50"}`}>
                <p className="text-xs text-muted-foreground">Stock bajo</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${lowStockCount ? "text-warning" : ""}`}>{lowStockCount}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Catálogo visible: hasta {products.length} productos cargados.</p>
            <Button variant={lowStockCount ? "outline" : "secondary"} nativeButton={false} render={<Link href="/inventory" />} className="w-full justify-between">
              {lowStockCount ? "Revisar existencias" : "Administrar inventario"}
              {lowStockCount ? <ArrowUpRightIcon /> : <PackageIcon />}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Productos más vendidos</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Según los días cerrados de {formatPeriodLabel(range).toLowerCase()}.</p>
          </div>
          <BoxesIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        </CardHeader>
        <CardContent>
          {bestSellers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay ventas cerradas en este período.</p>
          ) : (
            <div className="divide-y">
              {bestSellers.map((product, index) => (
                <div key={`${product.productId ?? product.productName}-${product.category ?? ""}`} className="flex min-h-14 items-center gap-3 py-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.productName}</p>
                    <p className="truncate text-xs text-muted-foreground">{product.category || "Sin categoría"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{product.quantity.toLocaleString("es-VE")} u.</p>
                    <p className="text-xs text-muted-foreground">{formatCurrencyCents(referenceCurrency, product.revenueCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashClosingPanel } from "@/components/reports/CashClosingPanel";
import { PendingClosingsList } from "@/components/reports/PendingClosingsList";
import { SalesTable } from "@/components/reports/SalesTable";
import { ChannelFilter, PaymentStatusFilter } from "@/components/reports/PaymentStatusFilter";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { formatCurrencyCents, getCurrency } from "@/lib/currencies";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSectionAccess } from "@/lib/session";
import { listRecentSales } from "@/lib/actions/sales";
import { getDailyClosingSummary, listPendingClosings, listRecentClosings } from "@/lib/actions/cash-closing";
import { parseDateRangeSelection, selectionToWindows, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; status?: string; channel?: string }>;
}) {
  const session = await requireSectionAccess("reports");
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
  const todayStr = todayDateString();
  const channelFilter = ["MOSTRADOR", "DELIVERY", "PICKUP", "ONLINE"].includes(params.channel ?? "") ? (params.channel as string) : "";
  const statusFilter = params.status === "PAID" || params.status === "CREDIT" ? params.status : "";

  const [
    recentSales,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl },
    fiscalData,
    todaySummary,
    pendingClosings,
    recentClosings,
  ] = await Promise.all([
    listRecentSales(500, selectionToWindows(range), statusFilter || undefined),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
    getDailyClosingSummary(todayStr),
    listPendingClosings(range),
    listRecentClosings(5),
  ]);
  const salesShown = channelFilter ? recentSales.filter((x) => x.channel === channelFilter) : recentSales;
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  // Closing the register and voiding/deleting sales are manager-only on the
  // server (KRPOS-SEC-002/004); hide those controls for sellers too.
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;
  const localCurrencyName = getCurrency(localCurrencyCode).name.split(" (")[0];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Cierre y control del turno</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Caja Chica</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Abre y cierra la caja, revisa las salidas y consulta las ventas del período.
          </p>
        </div>
        {exchangeRateEnabled && rate != null && (
          <span className="rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-semibold text-primary tabular-nums">
            Tasa BCV · {localCurrencyCode} {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
      </header>

      {todaySummary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Ventas del día", value: formatCurrencyCents(referenceCurrency, todaySummary.totalCents), sub: `${todaySummary.salesCount} ventas`, tone: "text-foreground" },
            { label: "Efectivo esperado", value: formatCurrencyCents(referenceCurrency, todaySummary.expectedCashCents), sub: "Apertura + efectivo − salidas", tone: "text-success" },
            { label: "Salidas", value: formatCurrencyCents(referenceCurrency, todaySummary.outflowsCents), sub: `${todaySummary.outflows.length} movimientos`, tone: "text-destructive" },
          ].map((k) => (
            <div key={k.label} className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
              <p className="text-sm font-medium text-muted-foreground">{k.label}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${k.tone}`}>{k.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
            </div>
          ))}
        </div>
      )}

      {todaySummary && (
        <Card>
          <CardHeader>
            <CardTitle>Estado de la caja</CardTitle>
          </CardHeader>
          <CardContent>
            <CashClosingPanel
              initialSummary={todaySummary}
              todayStr={todayStr}
              rate={rate}
              currencyCode={localCurrencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              company={company}
              branchName={session.branchName}
              printPaperSize={printPaperSize}
              canClose={canManage}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Días pendientes por cerrar</CardTitle>
          <p className="text-sm text-muted-foreground">
            Días con ventas en el período seleccionado abajo que todavía no tienen cierre de caja.
          </p>
        </CardHeader>
        <CardContent>
          <PendingClosingsList
            pendingDays={pendingClosings}
            hasBranchSelected={session.branchId != null}
            rate={rate}
            currencyCode={localCurrencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            canClose={canManage}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Historial de cierres</CardTitle>
            <p className="text-sm text-muted-foreground">Últimos cierres de caja</p>
          </CardHeader>
          <CardContent>
            {recentClosings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay cierres.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recentClosings.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="font-medium tabular-nums">{c.date.split("-").reverse().join("/")}</span>
                    <span className="text-muted-foreground">{c.salesCount} ventas</span>
                    <span className="rounded-full bg-success/14 px-2.5 py-0.5 text-xs font-semibold text-success">Cerrado</span>
                    <span className="font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, c.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Movimientos de Caja Chica</CardTitle>
            <p className="text-sm text-muted-foreground">Salidas del turno de hoy</p>
          </CardHeader>
          <CardContent>
            {!todaySummary || todaySummary.outflows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay salidas registradas hoy.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {todaySummary.outflows.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium">{o.concept}</span>
                    <span className="font-semibold tabular-nums text-destructive">−{formatCurrencyCents(referenceCurrency, o.amountCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>Ventas del día y del período</CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <ChannelFilter value={channelFilter} />
            <PaymentStatusFilter value={statusFilter} />
            <DateRangeSwitcher selection={range} extraParams={{ ...(statusFilter ? { status: statusFilter } : {}), ...(channelFilter ? { channel: channelFilter } : {}) }} />
          </div>
        </CardHeader>
        <CardContent>
          <SalesTable
            sales={salesShown}
            company={company}
            rate={rate}
            localCurrencyCode={localCurrencyCode}
            localCurrencyName={localCurrencyName}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            printPaperSize={printPaperSize}
            canManage={canManage}
          />
        </CardContent>
      </Card>
    </div>
  );
}

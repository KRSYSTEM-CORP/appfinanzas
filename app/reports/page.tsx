import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashClosingPanel } from "@/components/reports/CashClosingPanel";
import { PendingClosingsList } from "@/components/reports/PendingClosingsList";
import { SalesTable } from "@/components/reports/SalesTable";
import { PaymentStatusFilter } from "@/components/reports/PaymentStatusFilter";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { getCurrency } from "@/lib/currencies";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSectionAccess } from "@/lib/session";
import { listRecentSales } from "@/lib/actions/sales";
import { getDailyClosingSummary, listPendingClosings } from "@/lib/actions/cash-closing";
import { parseDateRangeSelection, selectionToWindows, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; status?: string }>;
}) {
  const session = await requireSectionAccess("reports");
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
  const todayStr = todayDateString();
  const statusFilter = params.status === "PAID" || params.status === "CREDIT" ? params.status : "";

  const [
    recentSales,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl },
    fiscalData,
    todaySummary,
    pendingClosings,
  ] = await Promise.all([
    listRecentSales(500, selectionToWindows(range), statusFilter || undefined),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
    getDailyClosingSummary(todayStr),
    listPendingClosings(range),
  ]);
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  const localCurrencyName = getCurrency(localCurrencyCode).name.split(" (")[0];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historial de ventas de contado y a crédito — registra pagos, anula o elimina ventas
          desde aquí.
        </p>
      </div>

      {todaySummary && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Cierre de caja</CardTitle>
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
            />
          </CardContent>
        </Card>
      )}

      <Card className="max-w-3xl">
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
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>Ventas</CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <PaymentStatusFilter value={statusFilter} />
            <DateRangeSwitcher selection={range} extraParams={statusFilter ? { status: statusFilter } : undefined} />
          </div>
        </CardHeader>
        <CardContent>
          <SalesTable
            sales={recentSales}
            company={company}
            rate={rate}
            localCurrencyCode={localCurrencyCode}
            localCurrencyName={localCurrencyName}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            printPaperSize={printPaperSize}
          />
        </CardContent>
      </Card>
    </div>
  );
}

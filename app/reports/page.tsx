import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashClosingPanel } from "@/components/reports/CashClosingPanel";
import { SalesTable } from "@/components/reports/SalesTable";
import { getCurrency } from "@/lib/currencies";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSession } from "@/lib/session";
import { listRecentSales } from "@/lib/actions/sales";
import { getDailyClosingSummary } from "@/lib/actions/cash-closing";
import { todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireSession();
  const todayStr = todayDateString();

  const [
    recentSales,
    { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize },
    { logoDataUrl },
    fiscalData,
    todaySummary,
  ] = await Promise.all([
    listRecentSales(500),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
    getDailyClosingSummary(todayStr),
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

      <Card>
        <CardHeader>
          <CardTitle>Ventas</CardTitle>
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

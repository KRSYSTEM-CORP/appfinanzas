import { ClockIcon, UsersIcon } from "lucide-react";
import { StatCard } from "@/components/reports/StatCard";
import { SalesTable } from "@/components/reports/SalesTable";
import { formatCurrencyCents, formatLocalCurrency, eurCentsToLocal, getCurrency } from "@/lib/currencies";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSectionAccess } from "@/lib/session";
import { listRecentSales } from "@/lib/actions/sales";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { parseDateRangeSelection, selectionToWindows, wholeYearSelection } from "@/lib/report-types";

export const dynamic = "force-dynamic";

// Credit sales that still have a balance to collect. Reuses the same sales
// list + detail panel as Reportes, so registering an abono, printing the
// documents or voiding a sale works exactly the same from here.
export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  const session = await requireSectionAccess("reports");
  const params = await searchParams;
  // Whole current year by default so an old unpaid sale doesn't drop out of view.
  const range = parseDateRangeSelection(params, wholeYearSelection());

  const [creditSales, { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize }, { logoDataUrl }, fiscalData] =
    await Promise.all([listRecentSales(500, selectionToWindows(range), "CREDIT"), getExchangeRateInfo(), getBranding(), getFiscalData()]);

  // Oldest first: the longest-outstanding balances are the ones to chase.
  const open = creditSales.filter((s) => !s.voided).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const remainingOf = (s: (typeof open)[number]) =>
    s.totalCents - s.payments.reduce((sum, p) => sum + p.amountEurCents, 0);
  const totalPendingCents = open.reduce((sum, s) => sum + remainingOf(s), 0);
  const customerCount = new Set(open.map((s) => s.customerId ?? s.id)).size;

  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  const localCurrencyName = getCurrency(localCurrencyCode).name.split(" (")[0];
  const money = (cents: number) =>
    exchangeRateEnabled && rate != null
      ? formatLocalCurrency(eurCentsToLocal(cents, rate), localCurrencyCode)
      : formatCurrencyCents(referenceCurrency, cents);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cuentas por cobrar</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ventas a crédito con saldo pendiente, de la más antigua a la más reciente — registra abonos
            desde el detalle de cada venta.
          </p>
        </div>
        <DateRangeSwitcher selection={range} />
      </div>

      <div className="rounded-lg border bg-card shadow-xs stat-grid divide-y md:divide-y-0 md:divide-x grid grid-cols-1 md:grid-cols-3 [&>*]:p-4">
        <StatCard
          label="Saldo por cobrar"
          accent="warning"
          icon={ClockIcon}
          value={
            <div className="flex flex-col">
              <span className={open.length > 0 ? "text-destructive" : undefined}>{money(totalPendingCents)}</span>
              {exchangeRateEnabled && (
                <span className="text-xs text-muted-foreground font-normal">
                  {formatCurrencyCents(referenceCurrency, totalPendingCents)}
                </span>
              )}
            </div>
          }
        />
        <StatCard label="Ventas pendientes" accent="primary" icon={ClockIcon} value={String(open.length)} />
        <StatCard label="Clientes con saldo" accent="violet" icon={UsersIcon} value={String(customerCount)} />
      </div>

      <SalesTable
        sales={open}
        company={company}
        rate={rate}
        localCurrencyCode={localCurrencyCode}
        localCurrencyName={localCurrencyName}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        printPaperSize={printPaperSize}
        emptyLabel="No hay ventas a crédito pendientes de cobro en este período."
      />
    </div>
  );
}

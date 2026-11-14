import { PendingClosingsRow } from "@/components/reports/PendingClosingsRow";
import Link from "next/link";
import { BanknoteIcon, FileTextIcon, TrendingDownIcon, WalletIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CajaChicaCard } from "@/components/reports/CajaChicaCard";
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
  searchParams: Promise<{ range?: string; year?: string; months?: string; status?: string; channel?: string; vista?: string }>;
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
    listRecentClosings(60),
  ]);
  const salesShown = channelFilter ? recentSales.filter((x) => x.channel === channelFilter) : recentSales;
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  // Closing the register and voiding/deleting sales are manager-only on the
  // server (KRPOS-SEC-002/004); hide those controls for sellers too.
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;
  const localCurrencyName = getCurrency(localCurrencyCode).name.split(" (")[0];

  const backLink = (
    <Link href="/reports" className="inline-flex w-fit items-center rounded-full bg-muted px-3.5 py-2 text-[13px] font-semibold">
      ← Volver a Caja Chica
    </Link>
  );
  if (params.vista === "historial") {
    return (
      <div className="flex flex-col gap-5 px-4 py-5">
        <header className="flex flex-col gap-3">
          <div>
            <p className="kr-eyebrow">Cierres de caja</p>
            <h1 className="kr-h1">Historial de cierres</h1>
          </div>
          {backLink}
        </header>
        <Card>
          <CardContent>
            {recentClosings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay cierres.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {recentClosings.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="font-bold tabular-nums">{c.date.split("-").reverse().join("/")}</span>
                    <span className="text-muted-foreground">{c.salesCount} ventas</span>
                    <span className="rounded-full bg-success/14 px-2.5 py-0.5 text-xs font-semibold text-success">Cerrado</span>
                    <span className="font-extrabold tabular-nums">{formatCurrencyCents(referenceCurrency, c.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
  if (params.vista === "movimientos" && todaySummary) {
    return (
      <div className="flex flex-col gap-5 px-4 py-5">
        <header className="flex flex-col gap-3">
          <div>
            <p className="kr-eyebrow">Entradas y salidas del turno</p>
            <h1 className="kr-h1">Movimientos de Caja Chica</h1>
          </div>
          {backLink}
        </header>
        <CajaChicaCard
          summary={todaySummary}
          canEdit={canManage && !todaySummary.closed}
          rate={rate}
          currencyCode={localCurrencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <header className="flex flex-col gap-3">
        <div>
          <p className="kr-eyebrow">Cierre y control del turno</p>
          <h1 className="kr-h1">Caja Chica</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {exchangeRateEnabled && rate != null && (
            <span className="rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary tabular-nums">
              Tasa Bs {rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            {new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Caracas" }).format(new Date())}
          </span>
        </div>
      </header>

      {todaySummary && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold">Estado de la caja</CardTitle>
              <p className="text-sm text-muted-foreground">
                {!todaySummary.closed && todaySummary.openingCents != null ? "Caja abierta · turno activo" : "Caja cerrada · sin turno activo"}
              </p>
            </div>
            <CashClosingPanel
              summary={todaySummary}
              rate={rate}
              currencyCode={localCurrencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              company={company}
              branchName={session.branchName}
              printPaperSize={printPaperSize}
              canClose={canManage}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link href="/reports?vista=historial" className="flex items-center gap-3 rounded-2xl bg-muted p-3.5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary"><FileTextIcon className="size-5" /></span>
                <span>
                  <span className="block font-bold">Historial de cierres</span>
                  <span className="text-xs text-muted-foreground">{recentClosings.length} {recentClosings.length === 1 ? "cierre" : "cierres"}</span>
                </span>
              </Link>
              <Link href="/reports?vista=movimientos" className="flex items-center gap-3 rounded-2xl bg-muted p-3.5">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary"><BanknoteIcon className="size-5" /></span>
                <span>
                  <span className="block font-bold">Movimientos de Caja Chica</span>
                  <span className="text-xs text-muted-foreground">Entradas y salidas · −{formatCurrencyCents(referenceCurrency, todaySummary.outflowsCents)}</span>
                </span>
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: "Ventas del día", value: formatCurrencyCents(referenceCurrency, todaySummary.totalCents), sub: `${todaySummary.paidCount} ventas pagadas`, Icon: BanknoteIcon, tone: "bg-success/14 text-success" },
                { label: "Efectivo esperado", value: formatCurrencyCents(referenceCurrency, todaySummary.expectedCashCents), sub: rate != null && exchangeRateEnabled ? `Bs ${Math.round((todaySummary.expectedCashCents / 100) * rate).toLocaleString("es-VE")}` : "Apertura + efectivo − salidas", Icon: WalletIcon, tone: "bg-primary/12 text-primary" },
                { label: "Salidas", value: formatCurrencyCents(referenceCurrency, todaySummary.outflowsCents), sub: `${todaySummary.outflows.length} movimientos`, Icon: TrendingDownIcon, tone: "bg-destructive/12 text-destructive" },
              ].map((k) => (
                <div key={k.label} className="relative min-h-32 rounded-[19px] bg-card p-[17px] shadow-(--shadow-card)">
                  <p className="pr-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
                  <span className={`absolute right-4 top-4 grid size-[34px] place-items-center rounded-full ${k.tone}`}><k.Icon className="size-[18px]" /></span>
                  <p className="mt-1.5 text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{k.value}</p>
                  <p className="mt-1.5 text-[13px] text-muted-foreground">{k.sub}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <PendingClosingsRow count={pendingClosings.length}>
        <PendingClosingsList
          pendingDays={pendingClosings}
          hasBranchSelected={session.branchId != null}
          rate={rate}
          currencyCode={localCurrencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          canClose={canManage}
        />
      </PendingClosingsRow>

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

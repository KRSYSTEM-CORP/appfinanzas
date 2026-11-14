import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { BalanceSummary } from "@/components/accounting/BalanceSummary";
import { BreakevenByCategory } from "@/components/accounting/BreakevenByCategory";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { revenueTotals } from "@/lib/actions/reports";
import { costOfGoodsSold, expensesTotal, categoryMargins, productMargins } from "@/lib/actions/finance";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { monthProjection } from "@/lib/admin-balance";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Administración → Balance → Resumen.
export default async function AccountingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const range = parseDateRangeSelection(await searchParams, { kind: "preset", preset: "month" });
  const today = todayDateString();
  const [totals, cogsCents, expensesCents, commissionsCents, categories, products, { referenceCurrency, rate, exchangeRateEnabled }] = await Promise.all([
    revenueTotals(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    commissionsTotal(range),
    categoryMargins(range),
    productMargins(range),
    getExchangeRateInfo(),
  ]);
  const b = { salesCents: totals.totalEurCents, cogsCents, expensesCents, commissionsCents };
  const label = selectionLabel(range, today);
  const [y, mo, d] = today.split("-").map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const projection =
    range.kind === "preset" && range.preset === "month" ? { cents: monthProjection(b.salesCents, d, days), day: d, days, monthName: MONTHS[mo - 1] } : null;

  return (
    <AdminShell group="balance" sub="resumen">
      <PeriodBar label={label}>
        <DateRangeSwitcher selection={range} />
      </PeriodBar>
      <BalanceSummary b={b} currency={referenceCurrency} rate={exchangeRateEnabled ? rate : null} periodLabel={label} projection={projection} />
      <BreakevenByCategory categories={categories} products={products} expensesCents={expensesCents} salesCents={b.salesCents} currency={referenceCurrency} />
    </AdminShell>
  );
}

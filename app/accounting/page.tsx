import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { BalanceSummary } from "@/components/accounting/BalanceSummary";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { revenueTotals } from "@/lib/actions/reports";
import { costOfGoodsSold, expensesTotal, listExpenses } from "@/lib/actions/finance";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

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
  const [totals, cogsCents, expensesCents, commissionsCents, expenses, { referenceCurrency, rate, exchangeRateEnabled }] = await Promise.all([
    revenueTotals(range),
    costOfGoodsSold(range),
    expensesTotal(range),
    commissionsTotal(range),
    listExpenses(range),
    getExchangeRateInfo(),
  ]);
  const b = { salesCents: totals.totalEurCents, cogsCents, expensesCents, commissionsCents };
  const label = selectionLabel(range, today);

  return (
    <AdminShell group="balance" sub="resumen">
      <PeriodBar label={label}>
        <DateRangeSwitcher selection={range} />
      </PeriodBar>
      <BalanceSummary b={b} currency={referenceCurrency} rate={exchangeRateEnabled ? rate : null} periodLabel={label} expenses={expenses} />
    </AdminShell>
  );
}

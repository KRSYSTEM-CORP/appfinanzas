import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { listInternalUse, listAllProducts } from "@/lib/actions/products";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { AdminShell } from "@/components/accounting/AdminShell";
import { AddWithdrawalButton, InternalUsePanel } from "@/components/accounting/InternalUsePanel";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, selectionToWindows, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

// Administración → Consumo Interno.
export default async function ConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const range = parseDateRangeSelection(await searchParams, { kind: "preset", preset: "month" });
  const [all, products, { referenceCurrency, rate, exchangeRateEnabled }] = await Promise.all([listInternalUse(), listAllProducts(), getExchangeRateInfo()]);
  const windows = selectionToWindows(range);
  const rows = all.filter((r) => {
    const t = new Date(r.date).getTime();
    return windows.some((w) => t >= w.start.getTime() && t < w.end.getTime());
  });
  const label = selectionLabel(range, todayDateString());
  return (
    <AdminShell group="consumo" sub="retiros">
      <PeriodBar
        label={label}
        end={
          <AddWithdrawalButton
            currency={referenceCurrency}
            products={products.filter((p) => p.trackStock && p.stock > 0).map((p) => ({ id: p.id, name: p.name, stock: p.stock, costCents: p.costCents ?? 0 }))}
          />
        }
      >
        <DateRangeSwitcher selection={range} />
      </PeriodBar>
      <InternalUsePanel rows={rows} currency={referenceCurrency} rate={exchangeRateEnabled ? rate : null} periodLabel={label} />
    </AdminShell>
  );
}

import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { StatementsTabs } from "@/components/accounting/StatementsTabs";
import { getStatements, listMovements } from "@/lib/actions/statements";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; islr?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
  const islr = Number.isFinite(Number(params.islr)) && params.islr !== undefined ? Number(params.islr) : 15;
  const [statements, movements, { referenceCurrency }] = await Promise.all([
    getStatements(range, islr),
    listMovements(range),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kr-eyebrow">Administración</p>
          <h1 className="kr-h1">Contabilidad</h1>
        </div>
        <DateRangeSwitcher selection={range} extraParams={{ islr: String(islr) }} />
      </div>
      <StatementsTabs s={statements} movements={movements} currency={referenceCurrency} islr={islr} />
    </div>
  );
}

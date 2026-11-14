import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { StatementsTabs } from "@/components/accounting/StatementsTabs";
import { getStatements, listMovements } from "@/lib/actions/statements";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { statementTab } from "@/lib/admin-nav";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

// Administración → Contabilidad (Movimientos, Estado de resultados, Situación financiera,
// Análisis de costo y Resumen de IVA según ?tab=).
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string; islr?: string; tab?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const params = await searchParams;
  const tab = statementTab(params.tab);
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
  const islr = Number.isFinite(Number(params.islr)) && params.islr !== undefined ? Number(params.islr) : 15;
  const [statements, movements, { referenceCurrency, rate, exchangeRateEnabled }] = await Promise.all([
    getStatements(range, islr),
    listMovements(range),
    getExchangeRateInfo(),
  ]);
  const label = selectionLabel(range, todayDateString());

  return (
    <AdminShell group="conta" sub={tab}>
      <StatementsTabs
        tab={tab}
        s={statements}
        movements={movements}
        currency={referenceCurrency}
        islr={islr}
        periodLabel={label}
        rate={exchangeRateEnabled ? rate : null}
        periodBar={
          <PeriodBar label={label}>
            <DateRangeSwitcher selection={range} extraParams={{ islr: String(islr), tab }} />
          </PeriodBar>
        }
      />
    </AdminShell>
  );
}

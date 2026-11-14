import { FileTextIcon, LightbulbIcon, TrendingDownIcon } from "lucide-react";
import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { AddExpenseButton, ExpenseCategorySelect, ExpensesView, EXPENSE_CATEGORIES } from "@/components/accounting/ExpensesView";
import { RecurringExpenses } from "@/components/accounting/RecurringExpenses";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { expensesTotal, listExpenses } from "@/lib/actions/finance";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { bsOf, money } from "@/lib/money-display";
import { selectionLabel } from "@/lib/period-label";
import { recurringExpenses } from "@/lib/recurring-expenses";
import { parseDateRangeSelection, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

function daysAgo(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Administración → Balance → Gastos.
export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string; cat?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
  const today = todayDateString();
  const cat = typeof params.cat === "string" ? params.cat.slice(0, 60) : "";
  const [all, monthTotal, history, { referenceCurrency, localCurrencyCode, rate, exchangeRateEnabled }] = await Promise.all([
    listExpenses(range),
    expensesTotal({ kind: "preset", preset: "month" }),
    listExpenses({ kind: "range", from: daysAgo(today, 120), to: today }),
    getExchangeRateInfo(),
  ]);
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...all.map((e) => e.category ?? "Otros")])];
  const shown = cat ? all.filter((e) => (e.category ?? "Otros") === cat) : all;
  const total = shown.reduce((n, e) => n + e.amountCents, 0);
  const r = exchangeRateEnabled ? rate : null;
  const recurring = recurringExpenses(
    history.map((e) => ({
      description: e.description,
      category: e.category,
      amountCents: e.amountCents,
      localAmountCents: e.localAmountCents,
      enteredInLocal: e.enteredInLocal,
      spentAt: e.spentAt.toISOString().slice(0, 10),
    })),
    today
  );
  const soon = recurring.filter((x) => x.daysLeft <= 5).length;

  return (
    <AdminShell group="balance" sub="gastos">
      <KpiGrid>
        <Kpi
          tone="bad"
          icon={<TrendingDownIcon />}
          label="Gastos del filtro"
          value={money(referenceCurrency, total)}
          hint={[`${shown.length} registros`, bsOf(total, r)].filter(Boolean).join(" · ")}
        />
        <Kpi tone="info" icon={<FileTextIcon />} label="Total del mes" value={money(referenceCurrency, monthTotal)} hint="Alquiler, nómina, servicios, mercadeo y otros" />
        <Kpi tone="warn" icon={<LightbulbIcon />} label="Por vencer" value={soon} hint={`${soon} gasto(s) recurrente(s) vencen pronto`} />
      </KpiGrid>
      <PeriodBar
        label={selectionLabel(range, today)}
        start={<ExpenseCategorySelect categories={categories} value={cat} />}
        end={
          <AddExpenseButton
            referenceCurrency={referenceCurrency}
            localCurrencyCode={localCurrencyCode}
            canUseLocal={r != null && localCurrencyCode !== referenceCurrency}
            monthTotalCents={monthTotal}
            categories={categories}
          />
        }
      >
        <DateRangeSwitcher selection={range} extraParams={cat ? { cat } : undefined} />
      </PeriodBar>
      <ExpensesView
        expenses={shown.map((e) => ({
          id: e.id,
          description: e.description,
          category: e.category,
          amountCents: e.amountCents,
          localAmountCents: e.localAmountCents,
          enteredInLocal: e.enteredInLocal,
          spentAt: e.spentAt.toISOString(),
        }))}
        categories={categories}
        referenceCurrency={referenceCurrency}
        localCurrencyCode={localCurrencyCode}
        totalCents={total}
      />
      <RecurringExpenses items={recurring} referenceCurrency={referenceCurrency} localCurrencyCode={localCurrencyCode} />
    </AdminShell>
  );
}

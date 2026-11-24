import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { OutflowFilters } from "@/components/accounting/OutflowFilters";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { SectionCard } from "@/components/shared/SectionCard";
import { listOutflowHistory } from "@/lib/actions/cash-outflows";
import { listPaymentAccounts } from "@/lib/actions/payment-accounts";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { OUTFLOW_METHOD_LABEL } from "@/lib/cash-outflow";
import { bsOf, money } from "@/lib/money-display";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, SHOP_TIME_ZONE, todayDateString } from "@/lib/report-types";
import { ACCOUNT_KIND_LABELS } from "@/lib/payment-accounts";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("es-VE", { timeZone: SHOP_TIME_ZONE, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Administración → Balance → Salidas y devoluciones.
export default async function SalidasPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string; method?: string; account?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });
  const method = typeof params.method === "string" ? params.method : "";
  const accountId = typeof params.account === "string" ? params.account : "";
  const [rows, accounts, { referenceCurrency, rate, exchangeRateEnabled }] = await Promise.all([
    listOutflowHistory(range, { method, accountId }),
    listPaymentAccounts(false),
    getExchangeRateInfo(),
  ]);
  const label = selectionLabel(range, todayDateString());
  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  const r = exchangeRateEnabled ? rate : null;
  const extra = { ...(method ? { method } : {}), ...(accountId ? { account: accountId } : {}) };

  return (
    <AdminShell group="balance" sub="salidas">
      <PeriodBar
        label={label}
        start={
          <OutflowFilters
            method={method}
            accountId={accountId}
            accounts={accounts.map((a) => ({ id: a.id, label: [a.bankName ?? ACCOUNT_KIND_LABELS[a.kind], a.accountNumber].filter(Boolean).join(" · ") }))}
          />
        }
      >
        <DateRangeSwitcher selection={range} extraParams={Object.keys(extra).length ? extra : undefined} />
      </PeriodBar>
      <SectionCard title="Salidas y devoluciones" subtitle={`${label} · salidas de Caja Chica y devoluciones por anulación de venta`}>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Sin salidas en este filtro.</p>
        ) : (
          <>
            {rows.map((o) => {
              const own = o.currencyCode != null && o.amountCurrencyCents != null && o.currencyCode !== referenceCurrency;
              return (
                <div key={o.id} className="flex items-center justify-between gap-2.5 border-b py-2.5">
                  <div className="min-w-0">
                    <b>{o.concept}</b>
                    <small className="block text-xs text-muted-foreground">
                      {fmt.format(new Date(o.createdAt))} · {OUTFLOW_METHOD_LABEL[o.paymentMethod ?? "CASH"]}
                      {o.accountLabel ? ` · ${o.accountLabel}` : ""}
                      {o.createdByName ? ` · ${o.createdByName}` : ""}
                      {o.saleNumber != null ? ` · Venta N.º ${o.saleNumber}` : ""}
                    </small>
                  </div>
                  <div className="text-right font-bold tabular-nums text-destructive">
                    −{own ? money(o.currencyCode!, o.amountCurrencyCents!) : money(referenceCurrency, o.amountCents)}
                    <small className="block text-xs font-semibold text-muted-foreground">{own ? money(referenceCurrency, o.amountCents) : bsOf(o.amountCents, r)}</small>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between gap-2.5 pt-3">
              <b>Total ({rows.length})</b>
              <b className="tabular-nums">{money(referenceCurrency, total)}</b>
            </div>
          </>
        )}
      </SectionCard>
    </AdminShell>
  );
}

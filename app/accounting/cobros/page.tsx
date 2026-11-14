import { requireAccountingPlan, requirePermission } from "@/lib/session";
import { AdminShell } from "@/components/accounting/AdminShell";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { SectionCard } from "@/components/shared/SectionCard";
import { collectionsByMethod } from "@/lib/actions/collections";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { bsOf, money, pct } from "@/lib/money-display";
import { selectionLabel } from "@/lib/period-label";
import { parseDateRangeSelection, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Pago Móvil",
  POS: "Punto de venta",
  TRANSFER: "Transferencia",
  ZELLE: "Zelle",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
  OTHER: "Otro",
};
const SERIES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-6", "bg-chart-7", "bg-chart-5"];

// Administración → Balance → Cobros.
export default async function CobrosPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string }>;
}) {
  await requirePermission("admin");
  await requireAccountingPlan();
  const range = parseDateRangeSelection(await searchParams, { kind: "preset", preset: "month" });
  const [rows, { referenceCurrency, rate, exchangeRateEnabled, localCurrencyCode }] = await Promise.all([collectionsByMethod(range), getExchangeRateInfo()]);
  const label = selectionLabel(range, todayDateString());
  const total = rows.reduce((n, r) => n + r.refCents, 0);
  const r = exchangeRateEnabled ? rate : null;
  const name = (x: (typeof rows)[number]) => (x.method === "CASH" && x.local && rows.some((o) => o.method === "CASH" && !o.local) ? "Efectivo Bs" : LABEL[x.method] ?? x.method);

  return (
    <AdminShell group="balance" sub="cobros">
      <PeriodBar label={label}>
        <DateRangeSwitcher selection={range} />
      </PeriodBar>
      <SectionCard title="Cobros por método" subtitle={`${label} · bolívares en Bs, divisas en ${referenceCurrency === "EUR" ? "€" : "$"} con su referencia en Bs`}>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Sin cobros en días con cierre de caja en este periodo.</p>
        ) : (
          <>
            <div className="mb-1.5 flex h-[22px] gap-0.5 overflow-hidden rounded-full bg-track" role="img" aria-label="Reparto de cobros por método">
              {rows.map((x, i) => (
                <span key={`${x.method}${x.local}`} className={`block h-full ${SERIES[i % SERIES.length]}`} style={{ width: `${(x.refCents / total) * 100}%` }} />
              ))}
            </div>
            {rows.map((x, i) => (
              <div key={`${x.method}${x.local}`} className="flex items-center justify-between gap-2.5 border-b py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className={`size-2.5 flex-none rounded-full ${SERIES[i % SERIES.length]}`} />
                  <div className="min-w-0">
                    <b>{name(x)}</b>
                    <small className="block text-xs text-muted-foreground">
                      {pct(x.refCents, total)} del total · {x.local ? "Bolívares" : "Divisa"}
                    </small>
                  </div>
                </div>
                <div className="text-right font-bold tabular-nums">
                  {x.local ? money(localCurrencyCode === "VES" ? "VES" : localCurrencyCode, x.currencyCents) : money(referenceCurrency, x.refCents)}
                  {!x.local && bsOf(x.refCents, r) && <small className="block text-xs font-semibold text-muted-foreground">{bsOf(x.refCents, r)}</small>}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2.5 pt-3">
              <b>Total cobrado</b>
              <div className="text-right font-bold tabular-nums">
                {money(referenceCurrency, total, 0)}
                {bsOf(total, r) && <small className="block text-xs font-semibold text-muted-foreground">{bsOf(total, r)}</small>}
              </div>
            </div>
          </>
        )}
      </SectionCard>
    </AdminShell>
  );
}

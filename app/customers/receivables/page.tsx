import { BanknoteIcon, TrendingDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { Pill, StatusPill } from "@/components/shared/Pills";
import { SectionCard } from "@/components/shared/SectionCard";
import { SalesTable } from "@/components/reports/SalesTable";
import { getCurrency } from "@/lib/currencies";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { listRecentSales } from "@/lib/actions/sales";
import { money } from "@/lib/money-display";
import { requireAccountingPlan, requireSectionAccess } from "@/lib/session";
import { selectionToWindows, todayDateString, wholeYearSelection } from "@/lib/report-types";

export const dynamic = "force-dynamic";

type Bucket = "a" | "b" | "c";
const BUCKET: Record<Bucket, string> = { a: "0-30 días", b: "31-60 días", c: "Más de 60 días" };

// Marketing → Cuentas por cobrar (preview, vCobrar): Por cobrar, Vencido, antigüedad por cliente
// y «Registrar abono» sobre cada venta a crédito.
export default async function MarketingReceivablesPage() {
  await requireAccountingPlan();
  const session = await requireSectionAccess("reports");
  const [creditSales, { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize }, { logoDataUrl }, fiscalData] = await Promise.all([
    listRecentSales(500, selectionToWindows(wholeYearSelection()), "CREDIT"),
    getExchangeRateInfo(),
    getBranding(),
    getFiscalData(),
  ]);
  const open = creditSales.filter((s) => !s.voided).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const remainingOf = (s: (typeof open)[number]) => s.totalCents - s.payments.reduce((n, p) => n + p.amountEurCents, 0);
  const now = Date.parse(`${todayDateString()}T23:59:59Z`);
  const byCustomer = new Map<string, { name: string; cents: number; oldest: number }>();
  for (const s of open) {
    const rem = remainingOf(s);
    if (rem <= 0) continue;
    const key = s.customerId ?? s.id;
    const name = `${s.customerFirstName ?? ""} ${s.customerLastName ?? ""}`.trim() || "Cliente sin nombre";
    const age = Math.floor((now - s.createdAt.getTime()) / 86_400_000);
    const cur = byCustomer.get(key) ?? { name, cents: 0, oldest: 0 };
    cur.cents += rem;
    cur.oldest = Math.max(cur.oldest, age);
    byCustomer.set(key, cur);
  }
  const rows = [...byCustomer.values()].sort((a, b) => b.oldest - a.oldest);
  const bucketOf = (d: number): Bucket => (d <= 30 ? "a" : d <= 60 ? "b" : "c");
  const agg = { a: 0, b: 0, c: 0 };
  for (const s of open) {
    const rem = remainingOf(s);
    if (rem > 0) agg[bucketOf(Math.floor((now - s.createdAt.getTime()) / 86_400_000))] += rem;
  }
  const total = agg.a + agg.b + agg.c;
  const m = (c: number) => money(referenceCurrency, c, 0);
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };

  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <MarketingTabs active="/customers/receivables" />
      <KpiGrid>
        <Kpi tone="info" icon={<BanknoteIcon />} label="Por cobrar" value={m(total)} hint={`En ${rows.length} clientes`} />
        <Kpi tone="bad" icon={<TrendingDownIcon />} label="Vencido" value={m(agg.b + agg.c)} hint="Más de 30 días" />
      </KpiGrid>
      <SectionCard
        title="Antigüedad de la deuda"
        subtitle="Dónde está concentrado lo que te deben"
        action={
          <Button nativeButton={false} render={<a href="#ventas-a-credito" />}>
            Registrar abono
          </Button>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Pill tone="ok">0-30 días · {m(agg.a)}</Pill>
          <Pill tone="warn">31-60 · {m(agg.b)}</Pill>
          <Pill tone="bad">Más de 60 · {m(agg.c)}</Pill>
        </div>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nadie te debe: no hay ventas a crédito pendientes.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold text-muted-foreground [&>th]:px-3.5 [&>th]:py-[11px]">
                  <th>Cliente</th>
                  <th>Antigüedad</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const b = bucketOf(r.oldest);
                  return (
                    <tr key={i} className="border-b [&>td]:px-3.5 [&>td]:py-[11px]">
                      <td className="font-bold">{r.name}</td>
                      <td>
                        <StatusPill tone={b === "a" ? "ok" : b === "b" ? "warn" : "bad"}>{BUCKET[b]}</StatusPill>
                      </td>
                      <td className="text-right tabular-nums">{m(r.cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold [&>td]:px-3.5 [&>td]:py-[11px]">
                  <td>Total</td>
                  <td />
                  <td className="text-right tabular-nums">{m(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
      <SectionCard id="ventas-a-credito" title="Ventas a crédito" subtitle="Elige una venta para registrar el abono, imprimir o enviar el recordatorio">
        <SalesTable
          sales={open}
          company={company}
          rate={rate}
          localCurrencyCode={localCurrencyCode}
          localCurrencyName={getCurrency(localCurrencyCode).name.split(" (")[0]}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          printPaperSize={printPaperSize}
          canManage={session.role === "GERENTE" || session.isSuperAdmin}
          emptyLabel="No hay ventas a crédito pendientes de cobro."
        />
      </SectionCard>
    </div>
  );
}

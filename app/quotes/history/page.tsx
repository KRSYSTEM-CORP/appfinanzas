import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { formatCurrencyCents } from "@/lib/currencies";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteHistoryTable } from "@/components/quotes/QuoteHistoryTable";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { listQuotes } from "@/lib/actions/quotes";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection, selectionToWindows } from "@/lib/report-types";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function QuoteHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  await requireSectionAccess("quotes");
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });

  const [quotes, { referenceCurrency }] = await Promise.all([
    listQuotes(500, selectionToWindows(range)),
    getExchangeRateInfo(),
  ]);

  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const open = quotes.filter((q) => q.status === "PENDING");
  const won = quotes.filter((q) => q.status === "CONVERTED");
  const lost = quotes.filter((q) => q.status === "LOST");
  const sum = (a: typeof quotes) => a.reduce((t, q) => t + q.totalCents, 0);
  const closed = won.length + lost.length;
  const rate = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const total = Math.max(1, quotes.length);

  const kpis = [
    { label: "Abiertos", value: money(sum(open)), sub: `${open.length} esperando respuesta`, tone: "text-foreground" },
    { label: "Convertidos", value: money(sum(won)), sub: `${won.length} ya facturados`, tone: "text-success" },
    { label: "Perdidos", value: money(sum(lost)), sub: `${lost.length} presupuestos`, tone: "text-destructive" },
    { label: "Tasa de conversión", value: `${rate} %`, sub: "de los cerrados en el período", tone: "text-primary" },
  ];
  const funnel = [
    { label: "Creados", n: quotes.length, color: "bg-primary" },
    { label: "Abiertos", n: open.length, color: "bg-[#ff9f0a]" },
    { label: "Convertidos", n: won.length, color: "bg-success" },
    { label: "Perdidos", n: lost.length, color: "bg-destructive" },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Cotiza y da seguimiento</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Presupuestos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DateRangeSwitcher selection={range} />
          <Link href="/quotes" className={buttonVariants({ size: "lg" })}>
            + Nuevo presupuesto
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${k.tone}`}>{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <section className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
        <h2 className="text-base font-bold">Embudo de seguimiento</h2>
        <p className="mb-4 text-xs text-muted-foreground">De creado a facturado, según el período elegido</p>
        <ul className="flex flex-col gap-3">
          {funnel.map((f) => (
            <li key={f.label} className="grid grid-cols-[96px_1fr_84px] items-center gap-3 text-sm">
              <span className="font-medium">{f.label}</span>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full ${f.color}`} style={{ width: `${Math.round((f.n / total) * 100)}%` }} />
              </div>
              <span className="text-right font-semibold tabular-nums">
                {f.n} · {Math.round((f.n / total) * 100)} %
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Seguimiento</CardTitle>
          <p className="text-sm text-muted-foreground">
            Márcalos como aprobados o perdidos cuando sepas el resultado, uno por uno o en bloque.
          </p>
        </CardHeader>
        <CardContent>
          <QuoteHistoryTable quotes={quotes} referenceCurrency={referenceCurrency} />
        </CardContent>
      </Card>
    </div>
  );
}

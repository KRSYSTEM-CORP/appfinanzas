import Link from "next/link";
import { FileTextIcon, TargetIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
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
  const session = await requireSectionAccess("quotes");
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
    { label: "Abiertos", value: money(sum(open)), sub: `${open.length} esperando respuesta`, tone: "text-foreground", Icon: FileTextIcon, chip: "bg-warning/18 text-warning" },
    { label: "Convertidos", value: money(sum(won)), sub: `${won.length} ya facturados`, tone: "text-foreground", Icon: TrendingUpIcon, chip: "bg-success/14 text-success" },
    { label: "Perdidos", value: money(sum(lost)), sub: `${lost.length} presupuestos`, tone: "text-foreground", Icon: TrendingDownIcon, chip: "bg-destructive/12 text-destructive" },
    { label: "Tasa de conversión", value: `${rate} %`, sub: "de los cerrados en el período", tone: "text-foreground", Icon: TargetIcon, chip: "bg-primary/12 text-primary" },
  ];
  const funnel = [
    { label: "Creados", n: quotes.length, color: "bg-primary" },
    { label: "Enviados", n: quotes.filter((q) => q.sentAt != null).length, color: "bg-[#0f9d9a]" },
    { label: "Vistos", n: quotes.filter((q) => q.viewedAt != null).length, color: "bg-[#ff9f0a]" },
    { label: "Convertidos", n: won.length, color: "bg-success" },
  ];
  const lostReasons = new Map<string, number>();
  for (const q of lost) lostReasons.set(q.lostReason ?? "Sin motivo", (lostReasons.get(q.lostReason ?? "Sin motivo") ?? 0) + q.totalCents);
  const lostRows = [...lostReasons.entries()].sort((a, b) => b[1] - a[1]);
  const lostMax = Math.max(1, ...lostRows.map((r) => r[1]));


  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="kr-eyebrow">{session.companyName}</p>
          <h1 className="mt-1 kr-h1">Presupuestos</h1>
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
          <div key={k.label} className="relative min-h-32 rounded-[19px] bg-card p-[17px] shadow-(--shadow-card)">
            <p className="pr-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</p>
            <span className={`absolute right-4 top-4 grid size-[34px] place-items-center rounded-full ${k.chip}`} aria-hidden>
              <k.Icon className="size-[18px]" />
            </span>
            <p className={`mt-1.5 text-[34px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums ${k.tone}`}>{k.value}</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
        <h2 className="text-base font-bold">Embudo de seguimiento</h2>
        <p className="mb-4 text-xs text-muted-foreground">De creado a facturado, en el período elegido</p>
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
        <section className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
          <h2 className="text-base font-bold">Por qué se pierden</h2>
          <p className="mb-4 text-xs text-muted-foreground">Monto perdido por motivo</p>
          {lostRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay presupuestos perdidos en este período.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lostRows.map(([reason, cents]) => (
                <li key={reason} className="grid grid-cols-[130px_1fr_90px] items-center gap-3 text-sm">
                  <span className="truncate font-medium">{reason}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.max(2, Math.round((cents / lostMax) * 100))}%` }} />
                  </div>
                  <span className="text-right font-semibold tabular-nums">{money(cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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

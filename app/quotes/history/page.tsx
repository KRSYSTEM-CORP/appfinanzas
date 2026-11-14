import { FileTextIcon, TargetIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { formatCurrencyCents } from "@/lib/currencies";
import { QuoteHistoryTable } from "@/components/quotes/QuoteHistoryTable";
import { NewQuoteButton } from "@/components/quotes/NewQuoteSheet";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { listQuotes } from "@/lib/actions/quotes";
import { listActiveProducts } from "@/lib/actions/products";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { parseDateRangeSelection, selectionToWindows } from "@/lib/report-types";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Etiqueta del periodo en días de Venezuela: «Noviembre · día 13 de 30».
function periodLabel(preset: string | null): string | undefined {
  if (preset !== "month") return preset === "today" ? "Hoy" : preset === "7d" ? "Últimos 7 días" : undefined;
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date()).split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} · día ${d} de ${new Date(y, m, 0).getDate()}`;
}

export default async function QuoteHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  const session = await requireSectionAccess("quotes");
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });

  const [quotes, rateInfo, products, { logoDataUrl }, fiscalData] = await Promise.all([
    listQuotes(500, selectionToWindows(range)),
    getExchangeRateInfo(),
    listActiveProducts(),
    getBranding(),
    getFiscalData(),
  ]);
  const { referenceCurrency, rate, localCurrencyCode, exchangeRateEnabled } = rateInfo;
  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  const label = periodLabel(range.kind === "preset" ? range.preset : null);

  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const open = quotes.filter((q) => q.status === "PENDING");
  const won = quotes.filter((q) => q.status === "CONVERTED");
  const lost = quotes.filter((q) => q.status === "LOST");
  const sum = (a: typeof quotes) => a.reduce((t, q) => t + q.totalCents, 0);
  const closed = won.length + lost.length;
  const rateConv = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const total = Math.max(1, quotes.length);

  const kpis = [
    { label: "Abiertos", value: money(sum(open)), sub: `${open.length} esperando respuesta`, Icon: FileTextIcon, chip: "bg-warning/18 text-warning" },
    { label: "Convertidos", value: money(sum(won)), sub: `${won.length} ya facturados`, Icon: TrendingUpIcon, chip: "bg-success/14 text-success" },
    { label: "Perdidos", value: money(sum(lost)), sub: `${lost.length} presupuestos`, Icon: TrendingDownIcon, chip: "bg-destructive/12 text-destructive" },
    { label: "Tasa de conversión", value: `${rateConv} %`, sub: "de los cerrados en el periodo", Icon: TargetIcon, chip: "bg-primary/12 text-primary" },
  ];
  const funnel = [
    { label: "Creados", n: quotes.length, color: "bg-primary" },
    { label: "Enviados", n: quotes.filter((q) => q.sentAt != null).length, color: "bg-chart-2" },
    { label: "Vistos", n: quotes.filter((q) => q.viewedAt != null).length, color: "bg-chart-3" },
    { label: "Convertidos", n: won.length, color: "bg-success" },
  ];
  const lostReasons = new Map<string, number>();
  for (const q of lost) lostReasons.set(q.lostReason ?? "Sin motivo", (lostReasons.get(q.lostReason ?? "Sin motivo") ?? 0) + q.totalCents);
  const lostRows = [...lostReasons.entries()].sort((a, b) => b[1] - a[1]);
  const lostMax = Math.max(1, ...lostRows.map((r) => r[1]));

  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <header>
        <p className="kr-eyebrow">{session.companyName}</p>
        <h1 className="mt-1 kr-h1">Presupuestos</h1>
      </header>

      <div className="flex flex-wrap items-center gap-2.5">
        <PeriodBar label={label}>
          <DateRangeSwitcher selection={range} />
        </PeriodBar>
        <span className="flex-1" />
        <NewQuoteButton products={products} referenceCurrency={referenceCurrency} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="relative flex min-h-32 flex-col gap-1.5 rounded-[19px] bg-card p-[17px] shadow-(--shadow-card)">
            <p className="pr-11 text-xs font-semibold uppercase text-muted-foreground">{k.label}</p>
            <span className={`absolute right-3.5 top-3.5 grid size-[34px] place-items-center rounded-full ${k.chip}`} aria-hidden>
              <k.Icon className="size-[18px]" />
            </span>
            <p className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums">{k.value}</p>
            <p className="text-[13px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <h2 className="text-base font-bold">Embudo de seguimiento</h2>
          <p className="mb-4 text-[13px] text-muted-foreground">De creado a facturado{label ? ` · ${label}` : ""}</p>
          <ul className="flex flex-col gap-3">
            {funnel.map((f) => (
              <li key={f.label} className="grid grid-cols-[96px_1fr_84px] items-center gap-3 text-sm">
                <span className="font-medium">{f.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${f.color}`} style={{ width: `${Math.round((f.n / total) * 100)}%` }} />
                </div>
                <span className="text-right font-bold tabular-nums">
                  {f.n}
                  {quotes.length ? ` · ${Math.round((f.n / total) * 100)} %` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <h2 className="text-base font-bold">Por qué se pierden</h2>
          <p className="mb-4 text-[13px] text-muted-foreground">Monto perdido por motivo</p>
          {lostRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin presupuestos perdidos en este periodo.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lostRows.map(([reason, cents]) => (
                <li key={reason} className="grid grid-cols-[130px_1fr_90px] items-center gap-3 text-sm">
                  <span className="font-medium">{reason}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-destructive" style={{ width: `${Math.max(2, Math.round((cents / lostMax) * 100))}%` }} />
                  </div>
                  <span className="text-right font-bold tabular-nums">{money(cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <QuoteHistoryTable
        quotes={quotes}
        referenceCurrency={referenceCurrency}
        rate={rate}
        currencyCode={localCurrencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        company={company}
      />
    </div>
  );
}

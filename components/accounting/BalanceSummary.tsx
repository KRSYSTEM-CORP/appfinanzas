import { BanknoteIcon, ShoppingCartIcon, StarIcon, TrendingDownIcon } from "lucide-react";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { Note, SectionCard, TwoCol } from "@/components/shared/SectionCard";
import { ExpenseComposition } from "@/components/accounting/ExpenseComposition";
import { netProfit, waterfall, type BalanceInput } from "@/lib/admin-balance";
import { bsOf, money, pct } from "@/lib/money-display";
import { cn } from "@/lib/utils";

// Resumen de Balance (preview 05 · Administración → Balance → Resumen).
export function BalanceSummary({
  b,
  currency,
  rate,
  periodLabel,
  expenses,
}: {
  b: BalanceInput;
  currency: string;
  rate: number | null;
  periodLabel: string;
  // Gastos registrados del periodo, para la composición por categoría.
  expenses: { category: string | null; amountCents: number }[];
}) {
  const m = (c: number, d: 0 | 2 = 0) => money(currency, c, d);
  const net = netProfit(b);
  const gain = net >= 0;
  const bs = bsOf(net, rate);
  const bars = waterfall(b);
  const fx: [string, number][] = [
    ["Ventas", b.salesCents],
    ["Costo", b.cogsCents],
    ["Gastos", b.expensesCents],
    ["Comisiones", b.commissionsCents],
  ];

  return (
    <>
      <section
        aria-label="Ganancia neta estimada"
        data-kr="card"
        className={cn("grid gap-3.5 rounded-[19px] p-4 shadow-(--shadow-card)", gain ? "bg-[color-mix(in_srgb,var(--ok-solid)_12%,var(--card))]" : "bg-[color-mix(in_srgb,var(--bad-solid)_12%,var(--card))]")}
      >
        <div>
          <span className="kr-eyebrow">Ganancia neta estimada</span>
          <div className={cn("my-1 text-[clamp(2.5rem,9vw,3.6rem)] font-extrabold leading-[1.02] tracking-[-0.045em] tabular-nums", gain ? "text-success" : "text-destructive")}>
            {m(net, 2)}
          </div>
          <div className="text-muted-foreground">
            {[bs, `${pct(net, b.salesCents)} de margen`, periodLabel].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div role="img" aria-label="Ventas menos costo, gastos y comisiones" className="grid grid-cols-2 items-stretch gap-1.5 sm:flex sm:flex-wrap">
          {fx.map(([l, v], i) => (
            <span key={l} className="contents">
              {i > 0 && <span aria-hidden className="hidden self-center font-extrabold text-muted-foreground sm:inline">−</span>}
              <Fx label={l} value={m(v)} />
            </span>
          ))}
          <span aria-hidden className="hidden self-center font-extrabold text-muted-foreground sm:inline">=</span>
          <Fx label="Ganancia" value={m(net)} className={gain ? "bg-ok-solid/14" : "bg-bad-solid/12"} />
        </div>
        <Note className="m-0">Ingresos − costo de mercancía vendida − gastos − comisiones, para el periodo seleccionado.</Note>
      </section>

      <KpiGrid>
        <Kpi tone="info" icon={<BanknoteIcon />} label="Ventas" value={m(b.salesCents)} hint={periodLabel} />
        <Kpi tone="warn" icon={<ShoppingCartIcon />} label="Costo de lo vendido" value={m(b.cogsCents)} hint={`${pct(b.cogsCents, b.salesCents)} de las ventas`} />
        <Kpi tone="bad" icon={<TrendingDownIcon />} label="Gastos" value={m(b.expensesCents)} hint="Alquiler, nómina y más" />
        <Kpi tone="info" icon={<StarIcon />} label="Comisiones" value={m(b.commissionsCents)} hint="Vendedores" />
      </KpiGrid>

      <TwoCol>
        <SectionCard title="Cascada de utilidad" subtitle="Cómo cada dólar vendido llega a ser ganancia">
          {b.salesCents <= 0 ? (
            <p className="text-[13px] text-muted-foreground">Sin ventas en este periodo.</p>
          ) : (
            <svg className="block h-auto max-h-[340px] w-full" viewBox="0 0 420 290" role="img" aria-label={`Cascada de utilidad: ventas ${m(b.salesCents)}, utilidad ${m(net)}`}>
              {bars.map((x, i) => {
                const cx = 40 + i * 80;
                const next = bars[i + 1];
                const fill = x.tone === "brand" ? "var(--primary)" : x.tone === "ok" ? "var(--ok-solid)" : "var(--bad-solid)";
                return (
                  <g key={x.label}>
                    <rect x={cx - 28} y={x.y} width={56} height={Math.max(x.h, 0)} rx={8} style={{ fill }} {...(i === bars.length - 1 ? { stroke: "var(--foreground)", strokeWidth: 2.5 } : {})} />
                    <text x={cx} y={x.y - 8} textAnchor="middle" style={{ fill: "var(--foreground)", fontWeight: 700, fontSize: 13 }}>
                      {x.sign}
                      {m(x.value)}
                    </text>
                    <text x={cx} y={276} textAnchor="middle" style={i === bars.length - 1 ? { fill: "var(--foreground)", fontWeight: 800, fontSize: 12 } : { fill: "var(--muted-foreground)", fontSize: 12 }}>
                      {x.label}
                    </text>
                    {next && i < bars.length - 1 && (
                      <line x1={cx + 28} x2={cx + 52} y1={i === 0 ? x.y : x.y + x.h} y2={i === 0 ? x.y : x.y + x.h} stroke="var(--muted-foreground)" strokeDasharray="3 3" opacity={0.6} />
                    )}
                  </g>
                );
              })}
              <line x1={6} x2={414} y1={254} y2={254} stroke="var(--border)" />
            </svg>
          )}
        </SectionCard>

        <ExpenseComposition rows={expenses} currency={currency} periodLabel={periodLabel} />
      </TwoCol>
    </>
  );
}

function Fx({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className={cn("flex min-w-0 flex-col items-start rounded-[14px] bg-card px-3 py-2 shadow-(--shadow-card)", className)}>
      <small className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{label}</small>
      <b className="text-base tabular-nums">{value}</b>
    </span>
  );
}

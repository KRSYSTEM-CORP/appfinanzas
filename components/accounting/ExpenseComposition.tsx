import { SectionCard } from "@/components/shared/SectionCard";
import { expenseComposition } from "@/lib/admin-balance";
import { money, pct } from "@/lib/money-display";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--muted-foreground)"];

const R = 15.9155; // circunferencia = 100, así los trazos se leen directo en %

// Composición de gastos por categoría (Administración → Balance): dona + leyenda.
// Se dibuja con los gastos ya registrados del periodo; sin datos nuevos.
export function ExpenseComposition({
  rows,
  currency,
  periodLabel,
}: {
  rows: { category: string | null; amountCents: number }[];
  currency: string;
  periodLabel: string;
}) {
  const { slices, total } = expenseComposition(rows);
  const offsets = slices.map((_, i) => slices.slice(0, i).reduce((n, x) => n + x.share * 100, 0));
  return (
    <SectionCard title="Composición de gastos" subtitle={`En qué se va el dinero · ${periodLabel}`}>
      {total <= 0 ? (
        <p className="text-[13px] text-muted-foreground">Sin gastos registrados en este periodo.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative size-[168px] shrink-0">
            <svg
              viewBox="0 0 42 42"
              className="size-full -rotate-90"
              role="img"
              aria-label={`Gastos por categoría: ${slices.map((s) => `${s.label} ${pct(s.cents, total)}`).join(", ")}`}
            >
              <circle cx="21" cy="21" r={R} fill="none" stroke="var(--border)" strokeWidth="6" />
              {slices.map((s, i) => {
                const len = Math.max(s.share * 100 - 0.6, 0.01);
                return (
                  <circle
                    key={s.label}
                    cx="21"
                    cy="21"
                    r={R}
                    fill="none"
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth="6"
                    strokeDasharray={`${len} ${100 - len}`}
                    strokeDashoffset={-offsets[i]}
                    className="motion-safe:animate-[kr-donut-in_700ms_ease-out_backwards]"
                    style={{ animationDelay: `${i * 90}ms` }}
                  >
                    <title>{`${s.label}: ${money(currency, s.cents, 0)} (${pct(s.cents, total)})`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <small className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Total</small>
              <b className="text-lg tabular-nums">{money(currency, total, 0)}</b>
            </div>
          </div>
          <ul className="m-0 min-w-[180px] flex-1 list-none p-0">
            {slices.map((s, i) => (
              <li key={s.label} className="flex items-center justify-between gap-3 border-b py-2 text-sm last:border-b-0">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="truncate font-semibold">{s.label}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {money(currency, s.cents, 0)} <span className="text-muted-foreground">· {pct(s.cents, total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

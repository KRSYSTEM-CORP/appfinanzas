import { HBars, StatsCard } from "@/components/finance/StatsUi";
import s from "@/components/finance/stats.module.css";
import { formatCurrencyCents } from "@/lib/currencies";
import { marginTone, percentOf } from "@/lib/stats-view";

type Row = { category: string; revenueCents: number; cogsCents: number };

const TONE_COLOR = { ok: "var(--m-caja)", brand: "var(--primary)", warn: "var(--chart-3)" } as const;

// Costos y rentabilidad (preview): margen por producto en barras horizontales
// que crecen de mayor a menor; verde el tercio más rentable, naranja el menos.
export function ProductMarginsCard({ rows, currency }: { rows: Row[]; currency: string }) {
  const list = rows
    .filter((r) => r.revenueCents > 0)
    .map((r) => ({ ...r, margin: percentOf(r.revenueCents - r.cogsCents, r.revenueCents) }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 10);
  return (
    <StatsCard title="Costos y rentabilidad" sub="Margen por producto = (precio − costo) ÷ precio">
      {list.length === 0 ? (
        <p className={s.empty}>Sin ventas con costo registrado en este período.</p>
      ) : (
        <HBars
          max={100}
          rows={list.map((r, i) => ({
            label: r.category,
            value: Math.max(0, r.margin),
            display: `${r.margin.toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`,
            color: TONE_COLOR[marginTone(i, list.length)],
            title: `${r.category}: vendido ${formatCurrencyCents(currency, r.revenueCents)} · costo ${formatCurrencyCents(currency, r.cogsCents)}`,
          }))}
        />
      )}
    </StatsCard>
  );
}

import Link from "next/link";
import { CakeIcon, MoonIcon, RepeatIcon, UsersIcon } from "lucide-react";
import { SEGMENTS, type SegmentId } from "@/lib/marketing";
import type { MarketingInsights as Insights } from "@/lib/actions/marketing";

const KPIS = [
  { key: "registered", label: "Registrados", sub: "En tu CRM", Icon: UsersIcon, tone: "bg-primary/12 text-primary" },
  { key: "frequent", label: "Frecuentes", sub: "6 visitas o más", Icon: RepeatIcon, tone: "bg-success/14 text-success" },
  { key: "birthdays", label: "Cumpleañeros", sub: "En los próximos 30 días", Icon: CakeIcon, tone: "bg-warning/18 text-warning" },
  { key: "inactive", label: "Inactivos", sub: "Más de 45 días sin comprar", Icon: MoonIcon, tone: "bg-destructive/12 text-destructive" },
] as const;

const QUADRANT_TONE: Record<SegmentId, string> = {
  campeones: "bg-success/14",
  leales: "bg-primary/12",
  riesgo: "bg-warning/18",
  dormidos: "bg-destructive/12",
};

// KPI de Marketing y «Mapa de clientes»: cada cuadrante filtra la tabla (?grupo=).
export function MarketingInsights({ data, active }: { data: Insights; active: SegmentId | null }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}>
        {KPIS.map((k) => (
          <div key={k.key} className="relative flex min-h-32 flex-col gap-1.5 rounded-[19px] bg-card p-[17px] shadow-(--shadow-card)">
            <span className="pr-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</span>
            <span className={`absolute right-3.5 top-3.5 grid size-[34px] place-items-center rounded-full ${k.tone}`} aria-hidden>
              <k.Icon className="size-[18px]" />
            </span>
            <span className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums">{data.kpis[k.key]}</span>
            <span className="text-[13px] text-muted-foreground">{k.sub}</span>
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
        <div>
          <h2 className="font-bold">Mapa de clientes</h2>
          <p className="text-xs text-muted-foreground">Por frecuencia y gasto. Toca un grupo para filtrar la tabla.</p>
        </div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))" }}>
          {SEGMENTS.map((s) => (
            <Link
              key={s.id}
              href={active === s.id ? "/customers" : `/customers?grupo=${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              className={`flex min-h-24 flex-col justify-between rounded-[14px] border-2 p-3 ${QUADRANT_TONE[s.id]} ${active === s.id ? "border-primary" : "border-transparent"}`}
            >
              <b className="text-sm">{s.label}</b>
              <span className="text-[26px] font-bold tabular-nums leading-none">{data.segmentCounts[s.id]}</span>
              <small className="text-[11px] text-muted-foreground">{s.hint}</small>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

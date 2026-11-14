"use client";

import { useState } from "react";
import { formatCurrencyCents } from "@/lib/currencies";
import { percentOf, waterfallSteps } from "@/lib/stats-view";
import s from "@/components/finance/stats.module.css";

// Cascada de utilidad (diseño de la preview: barras de 56 px con radio 8, ventas
// en la marca, descuentos en rojo, utilidad en verde con borde). Animación
// nueva: las ventas suben, cada descuento cae desde arriba hasta su escalón
// (uno tras otro), los conectores punteados se trazan y la utilidad crece con
// un destello. Al pasar el puntero muestra el monto y su peso sobre las ventas.
export function WaterfallChart({
  revenueCents,
  cogsCents,
  expensesCents,
  commissionsCents,
  currency,
}: {
  revenueCents: number;
  cogsCents: number;
  expensesCents: number;
  commissionsCents: number;
  currency: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const steps = waterfallSteps(revenueCents, cogsCents, expensesCents, commissionsCents);
  const money = (c: number) => formatCurrencyCents(currency, c);
  const W = 420;
  const H = 290;
  const top = 34;
  const bot = 36;
  const ch = H - top - bot;
  const lo = Math.min(0, ...steps.map((x) => x.from));
  const hi = Math.max(1, ...steps.map((x) => x.to));
  const y = (v: number) => top + ch - ((v - lo) / (hi - lo)) * ch;
  const bw = 56;
  const xOf = (i: number) => 12 + i * 80;
  const profit = steps[4].value;

  return (
    <div className={s.chartWrap}>
      <svg
        className={s.svgbox}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cascada de utilidad: ventas ${money(revenueCents)}, utilidad ${money(profit)}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="wf-final" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={profit >= 0 ? "var(--m-caja)" : "var(--destructive)"} stopOpacity="1" />
            <stop offset="1" stopColor={profit >= 0 ? "var(--m-caja)" : "var(--destructive)"} stopOpacity=".78" />
          </linearGradient>
        </defs>
        {steps.map((st, i) => {
          if (i === 0) return null;
          const prev = steps[i - 1];
          const level = prev.kind === "total" ? prev.to : prev.from;
          return (
            <line
              key={`l${i}`}
              className={`${s.a} ${s.wfLink}`}
              pathLength={1}
              x1={xOf(i) - 24}
              x2={xOf(i)}
              y1={y(level)}
              y2={y(level)}
              stroke="var(--muted-foreground)"
              strokeDasharray="3 3"
              opacity={0.6}
              style={{ ["--i" as string]: i - 1 }}
            />
          );
        })}
        {steps.map((st, i) => {
          const y1 = y(st.to);
          const hh = Math.max(y(st.from) - y1, 2);
          const fill = st.kind === "total" ? "var(--primary)" : st.kind === "down" ? "var(--destructive)" : "url(#wf-final)";
          const anim = st.kind === "total" ? s.wfTotal : st.kind === "down" ? s.wfDrop : s.wfFinal;
          const cx = xOf(i) + bw / 2;
          const lab = `${st.value < 0 ? "−" : ""}${money(Math.abs(st.value))}`;
          return (
            <g key={st.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${st.label}: ${lab}`}>
              {st.kind === "final" && (
                <rect className={`${s.a} ${s.wfGlow}`} x={xOf(i) - 6} y={y1 - 6} width={bw + 12} height={hh + 12} rx={12} fill={profit >= 0 ? "var(--m-caja)" : "var(--destructive)"} style={{ ["--i" as string]: i - 1 }} />
              )}
              <rect
                className={`${s.a} ${anim} ${s.wfBar}`}
                x={xOf(i)}
                y={y1}
                width={bw}
                height={hh}
                rx={8}
                fill={fill}
                stroke={st.kind === "final" ? "var(--foreground)" : undefined}
                strokeWidth={st.kind === "final" ? 2.5 : undefined}
                opacity={hover != null && hover !== i ? 0.55 : 1}
                style={{ ["--i" as string]: Math.max(0, i - 1), transition: "opacity .15s" }}
              />
              <text className={`${s.v} ${s.a} ${s.wfLabel}`} x={cx} y={y1 - 8} textAnchor="middle" style={{ fontSize: 13, ["--i" as string]: Math.max(0, i - 1) }}>
                {lab}
              </text>
              <text x={cx} y={H - 14} textAnchor="middle" style={st.kind === "final" ? { fill: "var(--foreground)", fontWeight: 800 } : undefined}>
                {st.label}
              </text>
            </g>
          );
        })}
        <line x1={6} x2={W - 6} y1={y(0)} y2={y(0)} stroke="var(--border)" />
      </svg>
      {hover != null && (
        <div className={s.tip} style={{ left: `${((xOf(hover) + bw / 2) / W) * 100}%`, top: `${(y(steps[hover].to) / H) * 100}%` }}>
          {steps[hover].label}: {steps[hover].value < 0 ? "−" : ""}
          {money(Math.abs(steps[hover].value))}
          <small>{hover === 0 ? "100 % de las ventas" : `${percentOf(Math.abs(steps[hover].value), revenueCents).toLocaleString("es-VE")} % de las ventas`}</small>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { TICKET_BUCKET_LIMITS, percentOf, ticketBucketLabels, ticketHistogram } from "@/lib/stats-view";
import s from "@/components/finance/stats.module.css";

// Distribución de ventas por monto (histograma de la preview, barras verde
// azulado de 60 px) con crecimiento escalonado y detalle al pasar el puntero.
export function TicketHistogramChart({ rows, symbol }: { rows: { bucket: number; count: number }[]; symbol: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const { counts, total, densest } = ticketHistogram(rows);
  const labels = ticketBucketLabels(symbol);
  if (total === 0) return <p className={s.empty}>Sin ventas en este período.</p>;
  const W = 400;
  const H = 210;
  const mx = Math.max(1, ...counts);
  const bw = 60;
  const limits = [0, ...TICKET_BUCKET_LIMITS];
  return (
    <>
      <div className={s.chartWrap}>
        <svg className={s.svgbox} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distribución de ventas" onMouseLeave={() => setHover(null)}>
          {counts.map((c, i) => {
            const x = 10 + i * 65;
            const hh = Math.max((c / mx) * 130, c > 0 ? 2 : 0);
            const yy = 160 - hh;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={x} y={20} width={bw} height={160} fill="transparent" />
                <rect
                  className={`${s.a} ${s.growY}`}
                  x={x}
                  y={yy}
                  width={bw}
                  height={hh}
                  rx={6}
                  fill="var(--chart-2)"
                  opacity={hover != null && hover !== i ? 0.5 : 1}
                  style={{ ["--i" as string]: i, transition: "opacity .15s" }}
                />
                <text className={`${s.v} ${s.a} ${s.fadeUp}`} x={x + bw / 2} y={yy - 6} textAnchor="middle" style={{ ["--i" as string]: i, ["--d" as string]: "350ms" }}>
                  {c}
                </text>
                <text x={x + bw / 2} y={182} textAnchor="middle" style={{ fontSize: 11 }}>
                  {labels[i]}
                </text>
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div className={s.tip} style={{ left: `${((10 + hover * 65 + bw / 2) / W) * 100}%`, top: `${((160 - (counts[hover] / mx) * 130) / H) * 100}%` }}>
            {counts[hover]} {counts[hover] === 1 ? "venta" : "ventas"} de {labels[hover]}
            <small>{percentOf(counts[hover], total).toLocaleString("es-VE")} % del total</small>
          </div>
        )}
      </div>
      {densest && (
        <p className={s.note}>
          {densest.start + 2 < limits.length
            ? `El ${densest.pct} % de las ventas está entre ${symbol}${limits[densest.start]} y ${symbol}${limits[densest.start + 2]}.`
            : `El ${densest.pct} % de las ventas es de ${symbol}${limits[densest.start]} o más.`}
        </p>
      )}
    </>
  );
}

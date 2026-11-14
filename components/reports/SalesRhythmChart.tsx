"use client";

import { useId, useRef, useState } from "react";
import { formatCurrencyCents } from "@/lib/currencies";
import { WEEKDAYS, areaPath, hourLabel, hourTotals, peakWindow, seriesPoints, smoothPath, weekdayTotals, type HeatCellLike } from "@/lib/stats-view";
import s from "@/components/finance/stats.module.css";

type Day = { day: string; totalEurCents: number; count: number };

// Coordenadas redondeadas: el servidor y el navegador no siempre dan el mismo
// último decimal en cos/sin y React avisaría de un desajuste al hidratar.
const px = (n: number) => Math.round(n * 100) / 100;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function dayLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

// Sustituye al mapa de calor: una curva de ventas por día que se traza al
// aparecer (con relleno en degradado y lectura al pasar el puntero), las
// barras de los días de la semana y un «reloj» de horas con rayos que salen del
// centro. Días y horas usan las ventas de las últimas 8 semanas.
export function SalesRhythmChart({ byDay, heat, currency }: { byDay: Day[]; heat: HeatCellLike[]; currency: string }) {
  const gid = useId().replace(/:/g, "");
  const money = (c: number) => formatCurrencyCents(currency, c);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const [hHour, setHHour] = useState<number | null>(null);

  const W = 640;
  const H = 220;
  const pad = { l: 10, r: 10, t: 26, b: 30 };
  const values = byDay.map((d) => d.totalEurCents);
  const pts = seriesPoints(values, W, H, pad);
  const base = H - pad.b;
  const max = Math.max(1, ...values);
  const best = values.length ? values.indexOf(Math.max(...values)) : -1;
  const tickIdx = byDay.length <= 1 ? [0] : Array.from(new Set([0, Math.floor((byDay.length - 1) / 2), byDay.length - 1]));

  const wk = weekdayTotals(heat);
  const wkMax = Math.max(1, ...wk);
  const wkPeak = wk.indexOf(Math.max(...wk));
  const hours = hourTotals(heat);
  const hMax = Math.max(1, ...hours);
  const peak = peakWindow(hours);
  const hasHeat = wk.some((v) => v > 0);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const el = svgRef.current;
    if (!el || pts.length === 0) return;
    const box = el.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let k = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < Math.abs(pts[k][0] - x)) k = i;
    setHi(k);
  }

  const R0 = 34;
  const RL = 64;
  const C = 120;
  const ang = (i: number) => (i / hours.length) * Math.PI * 2 - Math.PI / 2;
  const shownHour = hHour ?? (peak ? peak.start - 8 : null);

  return (
    <div className={s.rhythm}>
      <div>
        <p className={s.subh}>Ventas por día</p>
        {byDay.length === 0 ? (
          <p className={s.empty}>Sin ventas con cierre de caja en este período.</p>
        ) : (
          <div className={s.chartWrap}>
            <svg ref={svgRef} className={s.svgbox} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ventas por día: máximo ${money(max)}`} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
              <defs>
                <linearGradient id={`ar${gid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--primary)" stopOpacity=".32" />
                  <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75, 1].map((f) => (
                <line key={f} x1={pad.l} x2={W - pad.r} y1={base - f * (base - pad.t)} y2={base - f * (base - pad.t)} stroke="var(--border)" strokeDasharray="2 4" />
              ))}
              <line x1={pad.l} x2={W - pad.r} y1={base} y2={base} stroke="var(--border)" />
              {pts.length > 1 ? (
                <>
                  <path className={`${s.a} ${s.fillIn}`} d={areaPath(pts, base)} fill={`url(#ar${gid})`} style={{ ["--d" as string]: "700ms" }} />
                  <path className={`${s.a} ${s.draw}`} pathLength={1} d={smoothPath(pts)} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" />
                </>
              ) : (
                <rect className={`${s.a} ${s.growY}`} x={pts[0][0] - 22} y={pts[0][1]} width={44} height={base - pts[0][1]} rx={8} fill="var(--primary)" />
              )}
              {best >= 0 && pts.length > 1 && (
                <g className={`${s.a} ${s.pop}`} style={{ ["--d" as string]: "1300ms" }}>
                  <circle cx={pts[best][0]} cy={pts[best][1]} r={9} fill="var(--primary)" opacity={0.18} />
                  <circle cx={pts[best][0]} cy={pts[best][1]} r={4.5} fill="var(--card)" stroke="var(--primary)" strokeWidth={2.5} />
                  <text className={s.v} x={Math.min(Math.max(pts[best][0], 40), W - 40)} y={pts[best][1] - 12} textAnchor="middle" style={{ fontSize: 12 }}>
                    {money(values[best])}
                  </text>
                </g>
              )}
              {tickIdx.map((i) => (
                <text key={i} x={pts[i][0]} y={H - 8} textAnchor={byDay.length <= 1 ? "middle" : i === 0 ? "start" : i === byDay.length - 1 ? "end" : "middle"} style={{ fontSize: 11 }}>
                  {dayLabel(byDay[i].day)}
                </text>
              ))}
              {hi != null && (
                <g pointerEvents="none">
                  <line x1={pts[hi][0]} x2={pts[hi][0]} y1={pad.t - 6} y2={base} stroke="var(--primary)" strokeDasharray="3 3" opacity={0.6} />
                  <circle cx={pts[hi][0]} cy={pts[hi][1]} r={5} fill="var(--primary)" stroke="var(--card)" strokeWidth={2} />
                </g>
              )}
            </svg>
            {hi != null && (
              <div className={s.tip} style={{ left: `${(pts[hi][0] / W) * 100}%`, top: `${(pts[hi][1] / H) * 100}%` }}>
                {dayLabel(byDay[hi].day)}: {money(byDay[hi].totalEurCents)}
                <small>
                  {byDay[hi].count} {byDay[hi].count === 1 ? "venta" : "ventas"}
                </small>
              </div>
            )}
          </div>
        )}
      </div>

      <div className={s.rhythmSide}>
        {!hasHeat ? (
          <p className={s.empty}>Aún no hay suficientes ventas para ver tus días y horas fuertes.</p>
        ) : (
          <>
            <div>
              <p className={s.subh}>Días fuertes</p>
              <div className={s.wk} role="img" aria-label={`Ventas por día de la semana; el más fuerte es ${WEEKDAYS[wkPeak].toLowerCase()}`}>
                {wk.map((v, i) => (
                  <div key={i} className={s.wkCol} data-peak={i === wkPeak ? "" : undefined} title={`${WEEKDAYS[i]}: ${v} ${v === 1 ? "venta" : "ventas"}`}>
                    <b className={`${s.a} ${s.fadeUp}`} style={{ ["--i" as string]: i, ["--d" as string]: "400ms" }}>
                      {v}
                    </b>
                    <i className={`${s.wkBar} ${s.a} ${s.growY}`} style={{ height: `${Math.max(4, (v / wkMax) * 82)}%`, ["--i" as string]: i }} />
                    <span>{WEEKDAYS[i].slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className={s.subh}>Horas fuertes</p>
              <svg className={s.clock} viewBox="0 0 240 240" role="img" aria-label={peak ? `Hora pico de ${hourLabel(peak.start)} a ${hourLabel(peak.end)}` : "Ventas por hora"} onMouseLeave={() => setHHour(null)}>
                <circle cx={C} cy={C} r={R0 - 6} fill="var(--accent)" />
                {hours.map((v, i) => {
                  const a = ang(i);
                  const len = 6 + (v / hMax) * RL;
                  const isPeak = peak != null && (i === peak.start - 8 || i === peak.start - 7);
                  return (
                    <g key={i} className={s.clockRay} onMouseEnter={() => setHHour(i)}>
                      <line
                        className={`${s.a} ${s.ray}`}
                        x1={px(C + Math.cos(a) * R0)}
                        y1={px(C + Math.sin(a) * R0)}
                        x2={px(C + Math.cos(a) * (R0 + len))}
                        y2={px(C + Math.sin(a) * (R0 + len))}
                        stroke={isPeak ? "var(--chart-4)" : "var(--primary)"}
                        strokeOpacity={isPeak ? 1 : 0.35 + 0.65 * (v / hMax)}
                        strokeWidth={11}
                        strokeLinecap="round"
                        style={{ ["--i" as string]: i }}
                      />
                      <line x1={C} y1={C} x2={px(C + Math.cos(a) * (R0 + RL + 12))} y2={px(C + Math.sin(a) * (R0 + RL + 12))} stroke="transparent" strokeWidth={16} />
                      {i % 2 === 0 && (
                        <text x={px(C + Math.cos(a) * (R0 + RL + 20))} y={px(C + Math.sin(a) * (R0 + RL + 20) + 3)} textAnchor="middle">
                          {i + 8}
                        </text>
                      )}
                    </g>
                  );
                })}
                {shownHour != null && (
                  <>
                    <text className={s.ctr} x={C} y={C + 2} textAnchor="middle">
                      {hourLabel(shownHour + 8)}
                    </text>
                    <text className={s.ctrs} x={C} y={C + 15} textAnchor="middle">
                      {hHour != null ? `${hours[hHour]} ventas` : "hora pico"}
                    </text>
                  </>
                )}
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

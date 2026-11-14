"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { formatCurrencyCents } from "@/lib/currencies";
import { paretoRows } from "@/lib/stats-view";
import { StatsCard } from "@/components/finance/StatsUi";
import s from "@/components/finance/stats.module.css";

type Top = { productId: string | null; productName: string; revenueCents: number; quantity: number };
type Bottom = { productId: string; productName: string; quantity: number };

function short(name: string, max = 12): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

// Rendimiento de productos (Pareto 80/20) con el conmutador Más/Menos vendidos de
// la preview. Las barras crecen una tras otra, la línea del acumulado se traza
// encima y sus puntos aparecen al final; al pasar el puntero se ve el detalle.
export function ParetoChart({ top, bottom, currency }: { top: Top[]; bottom: Bottom[]; currency: string }) {
  const [mode, setMode] = useState<"mas" | "menos">("mas");
  const [hover, setHover] = useState<number | null>(null);
  const money = (c: number) => formatCurrencyCents(currency, c);
  const isMas = mode === "mas";
  const source = isMas
    ? top.slice(0, 10).map((t) => ({ key: `${t.productId}-${t.productName}`, name: t.productName, v: t.revenueCents }))
    : bottom.slice(0, 10).map((b) => ({ key: b.productId, name: b.productName, v: b.quantity }));
  const { rows, total, crossIndex } = paretoRows(source, (x) => x.v, isMas ? "desc" : "asc");
  const fmtV = (v: number) => (isMas ? money(v) : `${v.toLocaleString("es-VE")} und.`);
  const n = crossIndex + 1;

  const W = 400;
  const H = 300;
  const l = 8;
  const r = 40;
  const t = 18;
  const b = 78;
  const cw = W - l - r;
  const ch = H - t - b;
  const count = Math.max(rows.length, 1);
  const bw = cw / count;
  const mx = Math.max(1, ...rows.map((x) => x.value));
  const y80 = t + ch - 0.8 * ch;
  const pts = rows.map((x, i) => [l + i * bw + bw / 2, t + ch - x.cumPct * ch] as const);

  return (
    <StatsCard
      title="Rendimiento de productos"
      sub={
        isMas
          ? `Pareto 80/20 sobre ${money(total)} de los ${rows.length} productos listados`
          : `Pareto 80/20 sobre ${total.toLocaleString("es-VE")} unidades de los ${rows.length} productos listados`
      }
      action={
        <Segmented
          label="Más o menos vendidos"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setHover(null);
          }}
          options={[
            { value: "mas", label: "Más vendidos" },
            { value: "menos", label: "Menos vendidos" },
          ]}
        />
      }
    >
      {rows.length === 0 || total <= 0 ? (
        <p className={s.empty}>{isMas ? "Sin ventas de productos en este período." : "Tus productos activos no tienen ventas que comparar en este período."}</p>
      ) : (
        <>
          <div className={s.chartWrap} key={mode}>
            <svg className={s.svgbox} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Diagrama de Pareto de ${rows.length} productos`} onMouseLeave={() => setHover(null)}>
              {rows.map((x, i) => {
                const h = (x.value / mx) * ch * 0.92;
                const bx = l + i * bw;
                const cx = bx + bw / 2;
                return (
                  <g key={x.key} onMouseEnter={() => setHover(i)}>
                    <rect x={bx} y={t} width={bw} height={ch} fill="transparent" />
                    <rect
                      className={`${s.a} ${s.growY}`}
                      x={bx + 4}
                      y={t + ch - h}
                      width={bw - 8}
                      height={Math.max(h, 1)}
                      rx={5}
                      fill="var(--primary)"
                      opacity={(x.inA ? 1 : 0.45) * (hover != null && hover !== i ? 0.55 : 1)}
                      style={{ ["--i" as string]: i, transition: "opacity .15s" }}
                    />
                    <text className={`${s.v} ${s.a} ${s.fadeUp}`} x={cx} y={t + ch - h - 4} textAnchor="middle" style={{ fontSize: 11, ["--i" as string]: i, ["--d" as string]: "300ms" }}>
                      {isMas ? Math.round(x.value / 100).toLocaleString("es-VE") : x.value.toLocaleString("es-VE")}
                    </text>
                    <text transform={`translate(${cx + 3},${t + ch + 12}) rotate(-40)`} textAnchor="end" style={{ fontSize: 11 }}>
                      {short(x.name)}
                    </text>
                  </g>
                );
              })}
              <line className={`${s.a} ${s.wfLink}`} style={{ ["--i" as string]: -1 }} x1={l} x2={W - r} y1={y80} y2={y80} stroke="var(--chart-3)" strokeDasharray="5 4" strokeWidth={1.5} />
              <text x={W - r + 3} y={y80 + 4} style={{ fontSize: 11, fill: "var(--warning)", fontWeight: 700 }}>
                80 %
              </text>
              <polyline
                className={`${s.a} ${s.draw}`}
                pathLength={1}
                fill="none"
                stroke="var(--chart-4)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                points={pts.map((p) => p.join(",")).join(" ")}
                style={{ ["--d" as string]: `${300 + rows.length * 70}ms` }}
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  className={`${s.a} ${s.pop}`}
                  cx={p[0]}
                  cy={p[1]}
                  r={hover === i ? 5.5 : 3.5}
                  fill="var(--card)"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  style={{ ["--i" as string]: i, ["--d" as string]: `${900 + rows.length * 70}ms`, transition: "r .15s" }}
                />
              ))}
              <text x={W - r + 3} y={t + 6} style={{ fontSize: 11 }}>
                100 %
              </text>
            </svg>
            {hover != null && rows[hover] && (
              <div className={s.tip} style={{ left: `${(pts[hover][0] / W) * 100}%`, top: `${(Math.min(pts[hover][1], t + ch - (rows[hover].value / mx) * ch * 0.92) / H) * 100}%` }}>
                {rows[hover].name}: {fmtV(rows[hover].value)}
                <small>Acumulado {Math.round(rows[hover].cumPct * 100)} %</small>
              </div>
            )}
          </div>
          <div className={s.chiprow}>
            <span className={s.pill} data-tone="val">
              {isMas ? "Barras: ventas $" : "Barras: unidades"}
            </span>
            <span className={s.pill} data-tone="c4">
              Línea: acumulado
            </span>
            <span className={s.pill} data-tone="warn">
              Marca del 80 %
            </span>
          </div>
          <p className={s.note}>
            {isMas ? (
              <>
                Los primeros <b>{n} {n === 1 ? "producto genera" : "productos generan"}</b> el 80 % de la venta (clase A). Cuídalos de agotarse.
                {" "}Líder: <b>{rows[0].name}</b> con {money(rows[0].value)} en ventas.
              </>
            ) : (
              <>
                Estos {rows.length} productos aportan poco: en el orden de menor venta, el 80 % se alcanza recién con {n}. Revisa precio o exhibición.
                {" "}{rows[0].name} vendió {rows[0].value.toLocaleString("es-VE")} {rows[0].value === 1 ? "unidad" : "unidades"}: prueba un descuento o combo.
              </>
            )}
          </p>
        </>
      )}
    </StatsCard>
  );
}

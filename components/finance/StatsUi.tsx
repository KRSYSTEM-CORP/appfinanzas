"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BanknoteIcon, ChartColumnIcon, ShoppingCartIcon, StarIcon, TrendingDownIcon } from "lucide-react";
import { formatCurrencyCents } from "@/lib/currencies";
import { seriesPoints, smoothPath, areaPath } from "@/lib/stats-view";
import s from "./stats.module.css";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// true la primera vez que el elemento entra en pantalla (y se queda en true).
export function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setOn(true), 0);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.18 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return [ref, on];
}

// Contenedor que arranca las animaciones de sus hijos (`.a`) al verse.
export function Reveal({
  as = "div",
  className,
  children,
  style,
  tone,
}: {
  as?: "div" | "section";
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  tone?: string;
}) {
  const [ref, on] = useInView<HTMLDivElement>();
  const Tag = as;
  return (
    <Tag ref={ref} className={`${s.reveal} ${className ?? ""}`} data-on={on ? "" : undefined} data-tone={tone} style={style}>
      {children}
    </Tag>
  );
}

// Tarjeta de la preview: título 16 px, subtítulo gris 13 px y acción a la derecha.
export function StatsCard({
  title,
  sub,
  action,
  children,
  className,
}: {
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Reveal as="section" className={`${s.card} ${className ?? ""}`}>
      <header>
        <div>
          <h3>{title}</h3>
          {sub != null && <p>{sub}</p>}
        </div>
        {action}
      </header>
      {children}
    </Reveal>
  );
}

// Cifra que cuenta desde 0 hasta su valor al aparecer (ease-out, 900 ms).
export type NumFormat = { kind: "money"; currency: string } | { kind: "int" } | { kind: "pct"; digits?: number };

function formatNum(v: number, f: NumFormat): string {
  if (f.kind === "money") return formatCurrencyCents(f.currency, Math.round(v));
  if (f.kind === "pct") return `${v.toLocaleString("es-VE", { minimumFractionDigits: f.digits ?? 1, maximumFractionDigits: f.digits ?? 1 })} %`;
  return Math.round(v).toLocaleString("es-VE");
}

export function CountUp({ value, format, duration = 900 }: { value: number; format: NumFormat; duration?: number }) {
  const [ref, on] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!on) return;
    // Sin animación: `shown` sigue en null y se pinta el valor final.
    if (prefersReducedMotion() || value === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, value, duration]);
  // Antes de verse se muestra el valor final (sin saltos si no hay JS).
  return (
    <span ref={ref} aria-label={formatNum(value, format)}>
      <span aria-hidden>{formatNum(shown ?? value, format)}</span>
    </span>
  );
}

const KPI_ICONS = { money: BanknoteIcon, stats: ChartColumnIcon, down: TrendingDownIcon, cart: ShoppingCartIcon, star: StarIcon };

// KPI de la preview: etiqueta en mayúsculas, icono en círculo de color, cifra de
// 30 px que cuenta al aparecer, pista y una línea de pista (sparkline) opcional.
export function Kpi({
  tone,
  icon,
  label,
  value,
  format,
  hint,
  spark,
  index = 0,
}: {
  tone: "all" | "ok" | "warn" | "bad";
  icon: keyof typeof KPI_ICONS;
  label: string;
  value: number;
  format: NumFormat;
  hint: ReactNode;
  spark?: number[];
  index?: number;
}) {
  const Icon = KPI_ICONS[icon];
  return (
    <Reveal className={`${s.kpi} ${s.a} ${s.fadeUp}`} tone={tone} style={{ ["--i" as string]: index }}>
      <span className={s.lbl}>{label}</span>
      <span className={s.ic} aria-hidden>
        <Icon />
      </span>
      <span className={s.num}>
        <CountUp value={value} format={format} />
      </span>
      <span className={s.hint}>{hint}</span>
      {spark && spark.length > 1 && <Spark values={spark} />}
    </Reveal>
  );
}

function Spark({ values }: { values: number[] }) {
  const W = 320;
  const H = 30;
  const pts = seriesPoints(values, W, H, { l: 2, r: 2, t: 3, b: 3 });
  return (
    <svg className={s.spark} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path className={`${s.sparkArea} ${s.a} ${s.fillIn}`} d={areaPath(pts, H)} style={{ ["--d" as string]: "700ms" }} />
      <path className={`${s.a} ${s.draw}`} d={smoothPath(pts)} pathLength={1} />
    </svg>
  );
}

// Barras horizontales de la preview (.hb): nombre · pista · valor, que crecen
// una tras otra.
export function HBars({ rows, max }: { rows: { label: string; value: number; display: string; color?: string; title?: string }[]; max?: number }) {
  const m = Math.max(1, max ?? Math.max(0, ...rows.map((r) => r.value)));
  return (
    <div>
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className={s.hb} title={r.title ?? `${r.label}: ${r.display}`}>
          <span className={s.nm}>{r.label}</span>
          <div className={s.meter} role="img" aria-label={`${r.label}: ${r.display}`}>
            <span
              className={`${s.a} ${s.growX}`}
              style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: r.color ?? "var(--primary)", ["--i" as string]: i }}
            />
          </div>
          <span className={s.vl}>{r.display}</span>
        </div>
      ))}
    </div>
  );
}

// Barra apilada de la preview (.stack).
export function Stack({ parts, label }: { parts: { value: number; color: string; title: string }[]; label: string }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  return (
    <div className={s.stack} role="img" aria-label={label}>
      {parts.map((p, i) => (
        <span
          key={p.title}
          title={p.title}
          className={`${s.a} ${s.growX}`}
          style={{ width: `${total > 0 ? (p.value / total) * 100 : 0}%`, background: p.color, ["--i" as string]: i + 2 }}
        />
      ))}
    </div>
  );
}

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

// A fixed color per metric (never rotated/cycled) — e.g. Finanzas always
// shows Ingresos in blue, Gastos in red, Ganancia neta in green, etc. The
// accent colors the number itself, not a decorative card border — the
// number is the thing that's actually blue/red/green in the real world
// (money in vs. money out), so the color carries meaning instead of
// decorating the container around it.
export type StatCardAccent = "primary" | "success" | "warning" | "destructive" | "violet";

const ACCENT_VAR: Record<StatCardAccent, string> = {
  primary: "var(--chart-1)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  violet: "var(--chart-5)",
};

// Deliberately not a bordered Card — used in tight 3-4-up grids (Finanzas,
// Admin, CRM, Ventas por vendedor), and a grid of identical bordered boxes
// is the generic "hero metric" look every one of those screens would
// otherwise share. A plain label-over-value pair, differentiated only by
// its own accent color, reads as data rather than as a decorated widget.
export function StatCard({
  label,
  value,
  accent,
  icon: Icon,
  href,
  delta,
}: {
  label: string;
  value: ReactNode;
  accent?: StatCardAccent;
  icon?: ComponentType<{ className?: string }>;
  // Makes the whole metric a link to the screen behind it.
  href?: string;
  // Change versus a comparable period. `note` carries any caveat worth showing.
  delta?: { pct: number; label: string; note?: string; inverse?: boolean };
}) {
  const accentColor = accent ? ACCENT_VAR[accent] : undefined;
  const content = (
    <div className="relative flex min-h-[104px] flex-col gap-1.5">
      <span className="pr-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {Icon && (
        <span
          className="absolute right-0 top-0 grid size-[34px] place-items-center rounded-full"
          style={
            accentColor
              ? { color: accentColor, background: `color-mix(in oklab, ${accentColor} 14%, transparent)` }
              : undefined
          }
          aria-hidden
        >
          <Icon className="size-[18px]" />
        </span>
      )}
      <div className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums [overflow-wrap:anywhere]">
        {value}
      </div>
      {delta && (
        <div className="flex flex-col text-xs">
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span
              className={`font-medium tabular-nums ${delta.pct === 0 ? "text-muted-foreground" : (delta.pct > 0) !== !!delta.inverse ? "text-success" : "text-destructive"}`}
            >
              <span aria-hidden="true">{delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "•"}</span>{" "}
              <span className="sr-only">{delta.pct > 0 ? "Sube" : delta.pct < 0 ? "Baja" : "Sin cambio"} </span>
              {Math.abs(delta.pct)} %
            </span>
            <span className="text-muted-foreground">{delta.label}</span>
          </span>
          {delta.note && <span className="text-muted-foreground">{delta.note}</span>}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-md transition-colors duration-150 ease-out hover:bg-muted/50 active:scale-[0.99]">
      {content}
    </Link>
  ) : (
    content
  );
}

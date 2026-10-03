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
  delta?: { pct: number; label: string; note?: string };
}) {
  const accentColor = accent ? ACCENT_VAR[accent] : undefined;
  const content = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {Icon && (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg"
            style={
              accentColor
                ? { color: accentColor, background: `color-mix(in oklab, ${accentColor} 14%, transparent)` }
                : undefined
            }
          >
            <Icon className="size-4" />
          </span>
        )}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]" style={accentColor ? { color: accentColor } : undefined}>
        {value}
      </div>
      {delta && (
        <div className="flex flex-col text-xs">
          <span className="flex flex-wrap items-center gap-x-1.5">
            <span
              className={`font-medium tabular-nums ${delta.pct > 0 ? "text-success" : delta.pct < 0 ? "text-destructive" : "text-muted-foreground"}`}
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

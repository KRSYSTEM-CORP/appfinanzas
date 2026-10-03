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
}: {
  label: string;
  value: ReactNode;
  accent?: StatCardAccent;
  icon?: ComponentType<{ className?: string }>;
}) {
  const accentColor = accent ? ACCENT_VAR[accent] : undefined;
  return (
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
    </div>
  );
}

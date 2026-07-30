import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// A fixed color per metric (never rotated/cycled) — e.g. Finanzas always
// shows Ingresos in blue, Gastos in red, Ganancia neta in green, etc.
export type StatCardAccent = "primary" | "success" | "warning" | "destructive" | "violet";

const ACCENT_VAR: Record<StatCardAccent, string> = {
  primary: "var(--chart-1)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  violet: "var(--chart-5)",
};

export function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: StatCardAccent;
}) {
  const accentColor = accent ? ACCENT_VAR[accent] : undefined;
  return (
    <Card className={accentColor ? "border-l-4" : undefined} style={accentColor ? { borderLeftColor: accentColor } : undefined}>
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold" style={accentColor ? { color: accentColor } : undefined}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

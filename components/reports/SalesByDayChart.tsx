"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDayLabel, formatEUR, formatVES } from "@/lib/format";
import type { SalesByDayPoint } from "@/lib/report-types";

type ChartPoint = { day: string; ves: number; eur: number };

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatVES(point.ves)}</p>
      <p className="text-xs text-muted-foreground">{formatEUR(point.eur)}</p>
    </div>
  );
}

export function SalesByDayChart({ data }: { data: SalesByDayPoint[] }) {
  const chartData: ChartPoint[] = data.map((d) => ({
    day: formatDayLabel(d.day),
    ves: d.totalVES,
    eur: d.totalEurCents,
  }));

  if (chartData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Sin ventas en este período.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="ves" radius={[4, 4, 0, 0]} fill="var(--primary)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

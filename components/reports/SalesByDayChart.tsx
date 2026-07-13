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
import { formatCurrency, formatDayLabel } from "@/lib/format";
import type { SalesByDayPoint } from "@/lib/report-types";

export function SalesByDayChart({ data }: { data: SalesByDayPoint[] }) {
  const chartData = data.map((d) => ({
    day: formatDayLabel(d.day),
    total: d.totalCents / 100,
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
        <YAxis
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip formatter={(value) => formatCurrency(Number(value) * 100)} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="var(--primary)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

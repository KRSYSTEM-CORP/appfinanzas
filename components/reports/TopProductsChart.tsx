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
import type { TopProductPoint } from "@/lib/report-types";

export function TopProductsChart({ data }: { data: TopProductPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Sin ventas en este período.
      </p>
    );
  }

  const chartData = [...data].reverse();

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 36)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="productName"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip />
        <Bar dataKey="quantity" radius={[0, 4, 4, 0]} fill="var(--primary)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

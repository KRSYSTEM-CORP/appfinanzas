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
import { productPointLabel, type BottomProductPoint } from "@/lib/report-types";

export function BottomProductsChart({ data }: { data: BottomProductPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No hay productos activos en el inventario.
      </p>
    );
  }

  const chartData = [...data].reverse().map((p) => ({ ...p, label: productPointLabel(p) }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(280, chartData.length * 36)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip />
        <Bar dataKey="quantity" radius={[0, 4, 4, 0]} fill="var(--chart-3)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

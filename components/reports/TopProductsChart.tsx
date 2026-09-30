"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { productPointLabel, type TopProductPoint } from "@/lib/report-types";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Slice = TopProductPoint & { label: string; fill: string };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Slice }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-sm max-w-56">
      <p className="font-medium">{point.label}</p>
      <p className="text-xs text-muted-foreground">{point.quantity} unidades vendidas</p>
    </div>
  );
}

export function TopProductsChart({ data }: { data: TopProductPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        Sin ventas en este período.
      </p>
    );
  }

  const chartData: Slice[] = data.map((p, i) => ({
    ...p,
    label: productPointLabel(p),
    fill: SLICE_COLORS[i % SLICE_COLORS.length],
  }));

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="h-48 w-48 shrink-0 mx-auto sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="quantity"
              nameKey="label"
              innerRadius="58%"
              outerRadius="90%"
              paddingAngle={chartData.length > 1 ? 2 : 0}
              strokeWidth={0}
              animationDuration={700}
            >
              {chartData.map((entry, i) => (
                <Cell key={entry.productId ?? i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-2 w-full min-w-0">
        {chartData.map((p, i) => (
          <li key={p.productId ?? i} className="flex items-center gap-2 text-sm min-w-0">
            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: p.fill }} />
            <span className="truncate flex-1 min-w-0" title={p.label}>
              {p.label}
            </span>
            <span className="text-muted-foreground tabular-nums shrink-0">{p.quantity}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { productPointLabel, type BottomProductPoint } from "@/lib/report-types";

const SLICE_COLORS = [
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
];

type Slice = BottomProductPoint & { label: string; fill: string };

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

export function BottomProductsChart({ data }: { data: BottomProductPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-12 text-center">
        No hay productos activos en el inventario.
      </p>
    );
  }

  const chartData: Slice[] = data.map((p, i) => ({
    ...p,
    label: productPointLabel(p),
    fill: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  const totalQuantity = chartData.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="h-48 w-48 shrink-0 mx-auto sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {totalQuantity === 0 ? (
              <Pie
                data={[{ value: 1 }]}
                dataKey="value"
                innerRadius="58%"
                outerRadius="90%"
                strokeWidth={0}
                isAnimationActive={false}
              >
                <Cell fill="var(--muted)" />
              </Pie>
            ) : (
              <Pie
                data={chartData}
                dataKey="quantity"
                nameKey="label"
                innerRadius="58%"
                outerRadius="90%"
                paddingAngle={chartData.length > 1 ? 2 : 0}
                strokeWidth={0}
                animationDuration={240}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.productId} fill={entry.fill} />
                ))}
              </Pie>
            )}
            {totalQuantity > 0 && <Tooltip content={<ChartTooltip />} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-col gap-2 w-full min-w-0">
        {chartData.map((p) => (
          <li key={p.productId} className="flex items-center gap-2 text-sm min-w-0">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: p.quantity > 0 ? p.fill : "var(--muted-foreground)" }}
            />
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

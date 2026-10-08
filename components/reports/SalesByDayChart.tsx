"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDayLabel } from "@/lib/format";
import { formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { SalesByDayPoint } from "@/lib/report-types";
import type { ReferenceCurrency } from "@prisma/client";

type ChartPoint = { day: string; ves: number; eur: number };

function ChartTooltip({
  active,
  payload,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">
        {exchangeRateEnabled
          ? formatLocalCurrency(point.ves, currencyCode)
          : formatCurrencyCents(referenceCurrency, point.eur)}
      </p>
      {exchangeRateEnabled && (
        <p className="text-xs text-muted-foreground">{formatCurrencyCents(referenceCurrency, point.eur)}</p>
      )}
    </div>
  );
}

export function SalesByDayChart({
  data,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
}: {
  data: SalesByDayPoint[];
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
}) {
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
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="salesByDayFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip
          content={
            <ChartTooltip
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
            />
          }
        />
        <Area
          type="monotone"
          dataKey={exchangeRateEnabled ? "ves" : "eur"}
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#salesByDayFill)"
          animationDuration={240}
          dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

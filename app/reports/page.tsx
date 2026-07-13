import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatCard } from "@/components/reports/StatCard";
import { SalesByDayChart } from "@/components/reports/SalesByDayChart";
import { TopProductsChart } from "@/components/reports/TopProductsChart";
import { Price } from "@/components/money/Price";
import { formatDate, formatEUR, formatVES } from "@/lib/format";
import { revenueTotals, salesByDay, topProducts } from "@/lib/actions/reports";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import type { DateRangePreset } from "@/lib/report-types";
import { listRecentSales } from "@/lib/actions/sales";

export const dynamic = "force-dynamic";

const presets: { key: DateRangePreset; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range: DateRangePreset = presets.some((p) => p.key === rawRange)
    ? (rawRange as DateRangePreset)
    : "7d";

  const [totals, byDay, top, recentSales, { rate }] = await Promise.all([
    revenueTotals(range),
    salesByDay(range),
    topProducts(range),
    listRecentSales(10),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <div className="flex gap-1 rounded-lg border p-1">
          {presets.map((p) => (
            <Link
              key={p.key}
              href={`/reports?range=${p.key}`}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                range === p.key
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Ingresos totales"
          value={
            <div className="flex flex-col">
              <span>{formatVES(totals.totalVES)}</span>
              <span className="text-xs text-muted-foreground font-normal">
                {formatEUR(totals.totalEurCents)}
              </span>
            </div>
          }
        />
        <StatCard label="Número de ventas" value={String(totals.count)} />
        <StatCard
          label="Ticket promedio"
          value={
            <div className="flex flex-col">
              <span>
                {formatVES(totals.count > 0 ? totals.totalVES / totals.count : 0)}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {formatEUR(totals.avgEurCents)}
              </span>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por día</CardTitle>
          </CardHeader>
          <CardContent>
            <SalesByDayChart data={byDay} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top productos</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProductsChart data={top} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{formatDate(sale.createdAt)}</TableCell>
                    <TableCell>
                      {sale.items.reduce((sum, i) => sum + i.quantity, 0)}
                    </TableCell>
                    <TableCell>{sale.paymentMethod}</TableCell>
                    <TableCell className="text-right">
                      <Price
                        eurCents={sale.totalCents}
                        rate={sale.exchangeRate != null ? Number(sale.exchangeRate) : rate}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {recentSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Aún no hay ventas registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

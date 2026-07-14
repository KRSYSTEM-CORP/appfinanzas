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
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/reports/StatCard";
import { SalesByDayChart } from "@/components/reports/SalesByDayChart";
import { TopProductsChart } from "@/components/reports/TopProductsChart";
import { SaleActions } from "@/components/reports/SaleActions";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDate, formatEUR, formatVES } from "@/lib/format";
import { revenueTotals, receivablesTotals, salesByDay, topProducts } from "@/lib/actions/reports";
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

  const [totals, receivables, byDay, top, recentSales, { rate }] = await Promise.all([
    revenueTotals(range),
    receivablesTotals(),
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        <StatCard
          label={`Por cobrar (${receivables.count})`}
          value={
            <div className="flex flex-col">
              <span className={receivables.count > 0 ? "text-destructive" : undefined}>
                {formatVES(receivables.totalVES)}
              </span>
              <span className="text-xs text-muted-foreground font-normal">
                {formatEUR(receivables.totalEurCents)}
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
                  <TableHead>Cliente</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((sale) => (
                  <TableRow key={sale.id} className={sale.voided ? "opacity-50" : undefined}>
                    <TableCell>
                      {formatDate(sale.createdAt)}
                      {sale.voided && (
                        <span className="block">
                          <Badge variant="destructive">Anulada</Badge>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sale.customerFirstName
                        ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {sale.items.reduce((sum, i) => sum + i.quantity, 0)}
                    </TableCell>
                    <TableCell>
                      {sale.paymentMethod ? (
                        <>
                          {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                          {sale.paymentReference && (
                            <span className="block text-xs text-muted-foreground">
                              Ref: {sale.paymentReference}
                            </span>
                          )}
                          {sale.paidExchangeRate != null && sale.paidAt && (
                            <span className="block text-xs text-muted-foreground">
                              Cobrado: {formatDate(sale.paidAt)} · Tasa{" "}
                              {formatVES(Number(sale.paidExchangeRate))}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sale.paymentStatus === "CREDIT" ? (
                        <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
                      ) : (
                        <Badge variant="secondary">{PAYMENT_STATUS_LABELS.PAID}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {sale.paidInForeignCurrency ? (
                        <Badge variant="secondary">Divisas</Badge>
                      ) : (
                        <Badge variant="outline">Bolívares</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Price
                        eurCents={sale.totalCents}
                        rate={sale.exchangeRate != null ? Number(sale.exchangeRate) : rate}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <SaleActions
                        saleId={sale.id}
                        voided={sale.voided}
                        paymentStatus={sale.paymentStatus}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {recentSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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

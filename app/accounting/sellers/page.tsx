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
import { SalesTable } from "@/components/reports/SalesTable";
import { SellerCommissionForm } from "@/components/accounting/SellerCommissionForm";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { formatCurrencyCents, formatLocalCurrency, eurCentsToLocal, getCurrency } from "@/lib/currencies";
import { getBranding, getExchangeRateInfo, getFiscalData } from "@/lib/actions/settings";
import { requireSession } from "@/lib/session";
import { sellersSalesOverview, sellerSalesDetail } from "@/lib/actions/seller-reports";
import { parseDateRangeSelection, dateRangeSelectionToQuery } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function SellersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; seller?: string }>;
}) {
  const params = await searchParams;
  const sellerId = params.seller;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "7d" });

  const [session, overview, { rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency, printPaperSize }, { logoDataUrl }, fiscalData] =
    await Promise.all([
      requireSession(),
      sellersSalesOverview(range),
      getExchangeRateInfo(),
      getBranding(),
      getFiscalData(),
    ]);
  const detail = sellerId ? await sellerSalesDetail(sellerId, range) : null;

  const company = { name: session.companyName, logoDataUrl, ...fiscalData };
  const localCurrencyName = getCurrency(localCurrencyCode).name.split(" (")[0];

  function money(cents: number) {
    return exchangeRateEnabled && rate != null
      ? formatLocalCurrency(eurCentsToLocal(cents, rate), localCurrencyCode)
      : formatCurrencyCents(referenceCurrency, cents);
  }

  const rangeQuery = (extra: Record<string, string>) => {
    const query = new URLSearchParams({ ...dateRangeSelectionToQuery(range), ...extra });
    return `/accounting/sellers?${query.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ventas por vendedor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cuánto vendió cada vendedor y su comisión sobre esas ventas.
          </p>
        </div>
        <DateRangeSwitcher selection={range} extraParams={sellerId ? { seller: sellerId } : {}} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen por vendedor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right"># Ventas</TableHead>
                  <TableHead className="text-right">Total facturado</TableHead>
                  <TableHead className="text-right">% Comisión</TableHead>
                  <TableHead className="text-right">Comisión</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.map((row) => (
                  <TableRow key={row.userId} className={row.userId === sellerId ? "bg-muted/50" : undefined}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(row.totalEurCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.commissionPercent != null ? `${row.commissionPercent}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.commissionPercent != null ? money(row.commissionCents) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={rangeQuery({ seller: row.userId })}
                        className="text-primary underline underline-offset-2 text-sm"
                      >
                        Ver
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {overview.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Todavía no hay vendedores registrados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {sellerId && !detail && (
        <p className="text-sm text-destructive">No se encontró ese vendedor.</p>
      )}

      {detail && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-xl font-semibold">{detail.name}</h2>
            <Link href={rangeQuery({})} className="text-sm text-muted-foreground underline underline-offset-2">
              Quitar selección
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Ventas" accent="primary" value={detail.count} />
            <StatCard label="Total facturado" accent="success" value={money(detail.totalEurCents)} />
            <StatCard
              label="Comisión estimada"
              accent="violet"
              value={detail.commissionPercent != null ? money(detail.commissionCents) : "Sin configurar"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Comisión</CardTitle>
            </CardHeader>
            <CardContent>
              <SellerCommissionForm userId={detail.userId} initialPercent={detail.commissionPercent} />
              <p className="text-xs text-muted-foreground mt-2">
                Se aplica sobre el total facturado por este vendedor en el período seleccionado — es solo
                informativo, no afecta los precios ni el total de ninguna venta.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ventas de {detail.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <SalesTable
                sales={detail.sales}
                company={company}
                rate={rate}
                localCurrencyCode={localCurrencyCode}
                localCurrencyName={localCurrencyName}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
                printPaperSize={printPaperSize}
                showSellerColumn={false}
                emptyLabel="Sin ventas en este período."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

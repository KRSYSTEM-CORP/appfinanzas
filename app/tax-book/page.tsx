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
import { TaxBookExportButton } from "@/components/finance/TaxBookExportButton";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate } from "@/lib/format";
import { getSalesTaxBook, getPurchasesTaxBook } from "@/lib/actions/tax-book";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function TaxBookPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });

  const [sales, purchases, { referenceCurrency }] = await Promise.all([
    getSalesTaxBook(range),
    getPurchasesTaxBook(range),
    getExchangeRateInfo(),
  ]);

  const salesTotals = sales.reduce(
    (acc, s) => ({
      base: acc.base + s.baseImponibleCents,
      tax: acc.tax + s.taxCents,
      total: acc.total + s.totalCents,
    }),
    { base: 0, tax: 0, total: 0 }
  );
  const purchasesTotals = purchases.reduce(
    (acc, p) => ({
      base: acc.base + p.baseImponibleCents,
      tax: acc.tax + p.taxCents,
      retained: acc.retained + p.ivaRetainedCents,
      total: acc.total + p.totalCents,
    }),
    { base: 0, tax: 0, retained: 0, total: 0 }
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Libro de Contabilidad</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Formato de referencia para tu declaración de IVA ante el SENIAT — verifica los montos
            con tu contador antes de declarar.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangeSwitcher selection={range} />
          <TaxBookExportButton
            sales={sales}
            purchases={purchases}
            rangeLabel={
              range.kind === "preset" ? range.preset : `meses-${range.year}-${range.months.join("-")}`
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ventas: base imponible"
          accent="primary"
          value={formatCurrencyCents(referenceCurrency, salesTotals.base)}
        />
        <StatCard
          label="Ventas: IVA"
          accent="violet"
          value={formatCurrencyCents(referenceCurrency, salesTotals.tax)}
        />
        <StatCard
          label="Compras: base imponible"
          accent="success"
          value={formatCurrencyCents(referenceCurrency, purchasesTotals.base)}
        />
        <StatCard
          label="Compras: IVA"
          accent="warning"
          value={formatCurrencyCents(referenceCurrency, purchasesTotals.tax)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Libro de Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Nº control</TableHead>
                  <TableHead>Nº factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>RIF/Cédula</TableHead>
                  <TableHead className="text-right">Base imponible</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{formatDate(s.createdAt)}</TableCell>
                    <TableCell>{s.controlNumber ?? "—"}</TableCell>
                    <TableCell>{s.invoiceNumber ?? "—"}</TableCell>
                    <TableCell>{`${s.customerFirstName ?? ""} ${s.customerLastName ?? ""}`.trim() || "—"}</TableCell>
                    <TableCell>{s.customerRif ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, s.baseImponibleCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, s.taxCents)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrencyCents(referenceCurrency, s.totalCents)}
                    </TableCell>
                  </TableRow>
                ))}
                {sales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Sin ventas en este período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {sales.length > 0 && (
                <tfoot>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={5}>Totales</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, salesTotals.base)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, salesTotals.tax)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, salesTotals.total)}</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Libro de Compras</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Nº control</TableHead>
                  <TableHead>Factura proveedor</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>RIF</TableHead>
                  <TableHead className="text-right">Base imponible</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">IVA retenido</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDate(p.createdAt)}</TableCell>
                    <TableCell>{p.controlNumber ?? "—"}</TableCell>
                    <TableCell>{p.supplierInvoiceNo ?? "—"}</TableCell>
                    <TableCell>{p.supplier?.name ?? p.manualSupplierName ?? "—"}</TableCell>
                    <TableCell>{p.supplier?.rif ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.baseImponibleCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.taxCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.ivaRetainedCents)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrencyCents(referenceCurrency, p.totalCents)}
                    </TableCell>
                  </TableRow>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Sin compras en este período.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              {purchases.length > 0 && (
                <tfoot>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={5}>Totales</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, purchasesTotals.base)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, purchasesTotals.tax)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, purchasesTotals.retained)}</TableCell>
                    <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, purchasesTotals.total)}</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

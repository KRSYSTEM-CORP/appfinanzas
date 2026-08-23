import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SaleActions } from "@/components/reports/SaleActions";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDate } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { listRecentSales } from "@/lib/actions/sales";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type Sale = Awaited<ReturnType<typeof listRecentSales>>[number];

// Shared by Reportes (every sale) and Contabilidad → Ventas por vendedor (one
// seller's sales) so both stay visually identical — same columns, same
// document/action buttons — rather than two hand-maintained copies drifting
// apart. showSellerColumn is the only structural difference between the two
// call sites (redundant once a table is already scoped to one seller).
export function SalesTable({
  sales,
  company,
  rate,
  localCurrencyCode,
  localCurrencyName,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  showSellerColumn = true,
  emptyLabel = "Aún no hay ventas registradas.",
}: {
  sales: Sale[];
  company: DeliveryNoteCompany;
  rate: number | null;
  localCurrencyCode: string;
  localCurrencyName: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  showSellerColumn?: boolean;
  emptyLabel?: string;
}) {
  // Outstanding balance for a CREDIT sale — equal to totalCents until any
  // abono has been registered against it (see registerPayment).
  const remainingCentsBySaleId = new Map(
    sales.map((sale) => [
      sale.id,
      sale.totalCents - sale.payments.reduce((sum, p) => sum + p.amountEurCents, 0),
    ])
  );
  const colSpan = showSellerColumn ? 10 : 9;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cliente</TableHead>
            {showSellerColumn && <TableHead>Vendedor</TableHead>}
            <TableHead>Artículos</TableHead>
            <TableHead>Método</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Documentos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
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
              {showSellerColumn && (
                <TableCell className="text-muted-foreground">{sale.sellerName ?? "—"}</TableCell>
              )}
              <TableCell>{sale.items.reduce((sum, i) => sum + i.quantity, 0)}</TableCell>
              <TableCell>
                {sale.payments.length > 0 ? (
                  <>
                    {sale.payments.map((p) => (
                      <span key={p.id} className="block text-xs">
                        {PAYMENT_METHOD_LABELS[p.paymentMethod]}:{" "}
                        {formatCurrencyCents(
                          p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency),
                          p.amountCurrencyCents ?? p.amountEurCents
                        )}
                        {p.reference && ` (${p.reference})`}
                        {(p.createdAt || p.exchangeRate != null) && (
                          <span className="block text-muted-foreground">
                            {formatDate(p.createdAt)}
                            {p.exchangeRate != null &&
                              ` · Tasa ${formatLocalCurrency(Number(p.exchangeRate), localCurrencyCode)}`}
                          </span>
                        )}
                      </span>
                    ))}
                  </>
                ) : sale.paymentMethod ? (
                  <>
                    {PAYMENT_METHOD_LABELS[sale.paymentMethod]}
                    {sale.paymentReference && (
                      <span className="block text-xs text-muted-foreground">
                        Ref: {sale.paymentReference}
                      </span>
                    )}
                    {exchangeRateEnabled && sale.paidExchangeRate != null && sale.paidAt && (
                      <span className="block text-xs text-muted-foreground">
                        Cobrado: {formatDate(sale.paidAt)} · Tasa{" "}
                        {formatLocalCurrency(Number(sale.paidExchangeRate), localCurrencyCode)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                {sale.paymentStatus === "CREDIT" &&
                  remainingCentsBySaleId.get(sale.id) !== sale.totalCents && (
                    <span className="block text-xs font-medium text-warning">
                      Saldo pendiente:{" "}
                      {exchangeRateEnabled && rate != null
                        ? formatLocalCurrency(
                            eurCentsToLocal(remainingCentsBySaleId.get(sale.id) ?? 0, rate),
                            localCurrencyCode
                          )
                        : formatCurrencyCents(referenceCurrency, remainingCentsBySaleId.get(sale.id) ?? 0)}
                    </span>
                  )}
              </TableCell>
              <TableCell>
                {sale.paymentStatus === "CREDIT" ? (
                  <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
                ) : (
                  <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
                )}
              </TableCell>
              <TableCell>
                {!exchangeRateEnabled ? (
                  <Badge variant="outline">{referenceCurrency}</Badge>
                ) : sale.paidInForeignCurrency ? (
                  <Badge variant="secondary">Divisas</Badge>
                ) : (
                  <Badge variant="outline">{localCurrencyName}</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Price
                  eurCents={sale.totalCents}
                  rate={
                    sale.paidExchangeRate != null
                      ? Number(sale.paidExchangeRate)
                      : sale.exchangeRate != null
                        ? Number(sale.exchangeRate)
                        : rate
                  }
                  currencyCode={localCurrencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                />
              </TableCell>
              <TableCell className="text-right">
                <SaleDocumentButtons
                  sale={{
                    ...sale,
                    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
                    paidExchangeRate:
                      sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
                    payments: sale.payments.map((p) => ({
                      ...p,
                      exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
                    })),
                  }}
                  company={company}
                  currentRate={rate}
                  currencyCode={localCurrencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                  printPaperSize={printPaperSize}
                />
              </TableCell>
              <TableCell className="text-right">
                <SaleActions
                  saleId={sale.id}
                  voided={sale.voided}
                  paymentStatus={sale.paymentStatus}
                  totalCents={sale.totalCents}
                  remainingCents={remainingCentsBySaleId.get(sale.id) ?? sale.totalCents}
                  currentRate={rate}
                  currencyCode={localCurrencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                />
              </TableCell>
            </TableRow>
          ))}
          {sales.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

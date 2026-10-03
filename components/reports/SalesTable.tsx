import { ReceiptTextIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaymentMethodCell } from "@/components/reports/PaymentMethodCell";
import { SalesMasterDetail } from "@/components/reports/SalesMasterDetail";
import { toPlainSale } from "@/lib/sales-plain";
import { SaleActions } from "@/components/reports/SaleActions";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { Price } from "@/components/money/Price";
import { PAYMENT_STATUS_LABELS, formatDateSlash } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { listRecentSales } from "@/lib/actions/sales";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

const DEFAULT_EMPTY_LABEL = "Aún no hay ventas registradas.";

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
  emptyLabel = DEFAULT_EMPTY_LABEL,
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
    <>
    <SalesMasterDetail
      sales={sales.map(toPlainSale)}
      remainingCentsBySaleId={Object.fromEntries(remainingCentsBySaleId)}
      company={company}
      rate={rate}
      localCurrencyCode={localCurrencyCode}
      localCurrencyName={localCurrencyName}
      exchangeRateEnabled={exchangeRateEnabled}
      referenceCurrency={referenceCurrency}
      printPaperSize={printPaperSize}
      showSellerColumn={showSellerColumn}
      empty={
        <EmptyState
          icon={ReceiptTextIcon}
          title={emptyLabel}
          action={emptyLabel === DEFAULT_EMPTY_LABEL ? { href: "/pos", label: "Ir al punto de venta" } : undefined}
          className="rounded-lg border bg-card py-14 shadow-xs"
        />
      }
    />
    <div className="md:hidden overflow-x-auto">
      <Table className="table-cards sales-cards">
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Cliente</TableHead>
            {showSellerColumn && <TableHead>Vendedor</TableHead>}
            <TableHead>Artículos</TableHead>
            <TableHead className="text-center">Método</TableHead>
            <TableHead className="text-center">Estado</TableHead>
            <TableHead className="text-center">Moneda</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-center">Documentos</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale) => (
            <TableRow key={sale.id} className={sale.voided ? "opacity-50" : undefined}>
              <TableCell data-label="Fecha" data-cell="date">
                {formatDateSlash(sale.createdAt)}
                {sale.voided && (
                  <span className="block mt-1">
                    <Badge variant="destructive">Anulada</Badge>
                  </span>
                )}
              </TableCell>
              <TableCell data-label="Cliente" data-cell="client">
                {sale.customerFirstName
                  ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim()
                  : "—"}
              </TableCell>
              {showSellerColumn && (
                <TableCell data-label="Vendedor" data-cell="seller" className="text-muted-foreground">{sale.sellerName ?? "—"}</TableCell>
              )}
              <TableCell data-label="Artículos" data-cell="items">{sale.items.reduce((sum, i) => sum + i.quantity, 0)}</TableCell>
              <TableCell data-label="Método" data-cell="method" className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <PaymentMethodCell sale={sale} localCurrencyCode={localCurrencyCode} referenceCurrency={referenceCurrency} />
                  {sale.paymentStatus === "CREDIT" &&
                    remainingCentsBySaleId.get(sale.id) !== sale.totalCents && (
                      <span className="text-xs font-medium text-warning whitespace-nowrap">
                        Saldo:{" "}
                        {exchangeRateEnabled && rate != null
                          ? formatLocalCurrency(
                              eurCentsToLocal(remainingCentsBySaleId.get(sale.id) ?? 0, rate),
                              localCurrencyCode
                            )
                          : formatCurrencyCents(referenceCurrency, remainingCentsBySaleId.get(sale.id) ?? 0)}
                      </span>
                    )}
                </div>
              </TableCell>
              <TableCell data-label="Estado" data-cell="status" className="text-center">
                {sale.paymentStatus === "CREDIT" ? (
                  <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
                ) : (
                  <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
                )}
              </TableCell>
              <TableCell data-label="Moneda" data-cell="currency" className="text-center">
                {!exchangeRateEnabled ? (
                  <Badge variant="outline">{referenceCurrency}</Badge>
                ) : sale.paidInForeignCurrency ? (
                  <Badge variant="secondary">Divisas</Badge>
                ) : (
                  <Badge variant="outline">{localCurrencyName}</Badge>
                )}
              </TableCell>
              <TableCell data-label="Total" data-cell="total" className="text-right">
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
              <TableCell data-label="Documentos" data-cell="docs" className="text-center">
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
              <TableCell data-label="Acciones" data-cell="actions" className="text-right">
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
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colSpan} className="p-0">
                <EmptyState
                  icon={ReceiptTextIcon}
                  title={emptyLabel}
                  action={emptyLabel === DEFAULT_EMPTY_LABEL ? { href: "/pos", label: "Ir al punto de venta" } : undefined}
                  className="py-14"
                />
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
    </>
  );
}

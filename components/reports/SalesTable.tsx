import { BanknoteIcon, CircleDollarSignIcon, ReceiptTextIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SaleActions } from "@/components/reports/SaleActions";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDate, formatDateSlash } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { listRecentSales } from "@/lib/actions/sales";
import type { PaymentMethod, PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type Sale = Awaited<ReturnType<typeof listRecentSales>>[number];

// A single row's worth of "how they paid" — normalized from either the
// itemized sale.payments[] (current sales) or the legacy single
// paymentMethod/paymentReference/paidAt/paidExchangeRate fields (older sales
// from before payments were itemized), so PaymentMethodCell below never
// needs to know which shape it got.
type PaymentEntry = {
  method: PaymentMethod;
  currencyCode: string;
  amountCents: number | null;
  reference: string | null;
  date: Date | string | null;
  rate: number | null;
};

// Bolívares (the local currency) gets its own icon, distinct from any
// foreign/divisa currency (USD, EUR, USDT...) — the two payment "kinds" the
// user actually cares to tell apart at a glance, before opening the dialog
// for the full breakdown.
function paymentKind(currencyCode: string, localCurrencyCode: string): "local" | "foreign" {
  return currencyCode === localCurrencyCode ? "local" : "foreign";
}

function PaymentMethodCell({
  sale,
  localCurrencyCode,
  referenceCurrency,
}: {
  sale: Sale;
  localCurrencyCode: string;
  referenceCurrency: ReferenceCurrency;
}) {
  const entries: PaymentEntry[] =
    sale.payments.length > 0
      ? sale.payments.map((p) => ({
          method: p.paymentMethod,
          currencyCode: p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency),
          amountCents: p.amountCurrencyCents ?? p.amountEurCents,
          reference: p.reference,
          date: p.createdAt,
          rate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
        }))
      : sale.paymentMethod
        ? [
            {
              method: sale.paymentMethod,
              currencyCode: legacyCurrencyForPayment(sale.paymentMethod, referenceCurrency),
              amountCents: null,
              reference: sale.paymentReference,
              date: sale.paidAt,
              rate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
            },
          ]
        : [];

  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const kinds = new Set(entries.map((e) => paymentKind(e.currencyCode, localCurrencyCode)));

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Ver detalle del pago"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted transition-colors"
          />
        }
      >
        {kinds.has("local") && <BanknoteIcon className="size-4 text-muted-foreground" />}
        {kinds.has("foreign") && <CircleDollarSignIcon className="size-4 text-muted-foreground" />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cómo pagó el cliente</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          {entries.map((e, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium flex items-center gap-1.5">
                  {paymentKind(e.currencyCode, localCurrencyCode) === "local" ? (
                    <BanknoteIcon className="size-4 text-muted-foreground shrink-0" />
                  ) : (
                    <CircleDollarSignIcon className="size-4 text-muted-foreground shrink-0" />
                  )}
                  {PAYMENT_METHOD_LABELS[e.method]}
                </span>
                {e.amountCents != null && (
                  <span className="font-medium">{formatCurrencyCents(e.currencyCode, e.amountCents)}</span>
                )}
              </div>
              {e.reference && <span className="text-muted-foreground text-xs">Ref: {e.reference}</span>}
              {e.date && <span className="text-muted-foreground text-xs">{formatDate(e.date)}</span>}
              {e.rate != null && (
                <span className="text-muted-foreground text-xs">
                  Tasa {formatLocalCurrency(e.rate, localCurrencyCode)}
                </span>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
              <TableCell>
                {formatDateSlash(sale.createdAt)}
                {sale.voided && (
                  <span className="block mt-1">
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
              <TableCell className="text-center">
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
              <TableCell className="text-center">
                {sale.paymentStatus === "CREDIT" ? (
                  <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
                ) : (
                  <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
                )}
              </TableCell>
              <TableCell className="text-center">
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
              <TableCell className="text-center">
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
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={colSpan} className="p-0">
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                    <ReceiptTextIcon className="size-5" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-xs">{emptyLabel}</p>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

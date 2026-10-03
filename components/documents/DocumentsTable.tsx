"use client";

import { useCallback, useMemo, useState } from "react";
import { FileTextIcon, SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/money/Price";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { QuoteDocumentButton } from "@/components/quotes/QuoteDocumentButton";
import { PAYMENT_STATUS_LABELS, QUOTE_STATUS_LABELS, formatDate } from "@/lib/format";
import { controlNumberLabel, type DeliveryNoteCompany } from "@/lib/delivery-note";
import { formatCurrencyCents } from "@/lib/currencies";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import type { PaymentMethod, PaymentStatus, PrintPaperSize, QuoteStatus, ReferenceCurrency } from "@prisma/client";

// Each option shows ONLY the documents that were actually generated of that
// exact type — "Notas de entrega" is every non-voided sale (that's the base
// document any sale always gets), "Facturas"/"Recibos" narrow to sales that
// actually had that document requested, and "Presupuestos" is a completely
// different underlying list (Quote, not Sale).
type DocType = "delivery_note" | "invoice" | "receipt" | "quote";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  delivery_note: "Notas de entrega",
  invoice: "Facturas",
  receipt: "Recibos de pago",
  quote: "Presupuestos",
};

type DocumentSale = {
  id: string;
  controlNumber: number | null;
  receiptControlNumber: number | null;
  invoiceNumber: number | null;
  createdAt: Date;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  paidAt: Date | null;
  exchangeRate: number | null;
  paidExchangeRate: number | null;
  voided: boolean;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  sellerName: string | null;
  items: {
    id: string;
    productName: string;
    category: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
};

type DocumentQuote = {
  id: string;
  createdAt: Date;
  controlNumber: number | null;
  totalCents: number;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  status: QuoteStatus;
  sale: { id: string } | null;
};

export function DocumentsTable({
  sales,
  quotes,
  company,
  currentRate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
}: {
  sales: DocumentSale[];
  quotes: DocumentQuote[];
  company: DeliveryNoteCompany;
  currentRate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
}) {
  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState<DocType>("delivery_note");
  const [range, setRange] = useState<DateRangeSelection>({ kind: "preset", preset: "month" });

  const windows = useMemo(() => selectionToWindows(range), [range]);
  const inRange = useCallback((d: Date) => windows.some((w) => d >= w.start && d < w.end), [windows]);

  const filteredSales = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((sale) => {
      if (sale.voided) return false;
      if (docType === "invoice" && sale.invoiceNumber == null) return false;
      if (docType === "receipt" && sale.receiptControlNumber == null) return false;
      if (!inRange(new Date(sale.createdAt))) return false;
      const name = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.toLowerCase();
      return (
        !q ||
        name.includes(q) ||
        (sale.customerPhone ?? "").includes(q) ||
        controlNumberLabel(sale).toLowerCase().includes(q)
      );
    });
  }, [sales, query, docType, inRange]);

  const filteredQuotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (!inRange(new Date(quote.createdAt))) return false;
      const name = `${quote.customerFirstName ?? ""} ${quote.customerLastName ?? ""}`.toLowerCase();
      const label = quote.controlNumber != null ? String(quote.controlNumber) : quote.id.slice(-8);
      return !q || name.includes(q) || (quote.customerPhone ?? "").includes(q) || label.toLowerCase().includes(q);
    });
  }, [quotes, query, inRange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative max-w-sm flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Buscar documentos por cliente, teléfono o número de control"
              placeholder="Buscar por cliente, teléfono o Nº de control..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={docType} onValueChange={(v) => setDocType((v as DocType) ?? "delivery_note")}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo de documento">
                {(value: string | null) => DOC_TYPE_LABELS[(value as DocType) ?? "delivery_note"]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {DOC_TYPE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateRangeSwitcher selection={range} onChange={setRange} />
      </div>

      {docType === "quote" ? (
        <>
        <MasterDetail
          items={filteredQuotes}
          label="Presupuestos"
          renderRowMobile={(quote) => (
            <MobileRow
              title={quote.customerFirstName ? `${quote.customerFirstName} ${quote.customerLastName ?? ""}`.trim() : "—"}
              meta={`Nº ${quote.controlNumber ?? "—"} · ${formatDate(quote.createdAt)}`}
              badge={
                <Badge variant={quote.status === "CONVERTED" ? "success" : quote.status === "LOST" ? "destructive" : "outline"}>
                  {QUOTE_STATUS_LABELS[quote.status]}
                </Badge>
              }
              amount={<span className="font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, quote.totalCents)}</span>}
            />
          )}
          renderRow={(quote) => (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
                <FileTextIcon className="size-4 text-muted-foreground/60" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {quote.customerFirstName ? `${quote.customerFirstName} ${quote.customerLastName ?? ""}`.trim() : "—"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Nº {quote.controlNumber ?? "—"} · {formatDate(quote.createdAt)}
                </span>
              </span>
              <Badge variant={quote.status === "CONVERTED" ? "success" : quote.status === "LOST" ? "destructive" : "outline"}>
                {QUOTE_STATUS_LABELS[quote.status]}
              </Badge>
              <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">
                {formatCurrencyCents(referenceCurrency, quote.totalCents)}
              </span>
            </>
          )}
          renderDetail={(quote) => (
            <>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-lg font-semibold leading-tight">
                  {quote.customerFirstName ? `${quote.customerFirstName} ${quote.customerLastName ?? ""}`.trim() : "—"}
                </h3>
                <p className="text-sm text-muted-foreground">Presupuesto Nº {quote.controlNumber ?? "—"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Fecha</dt>
                  <dd className="font-medium">{formatDate(quote.createdAt)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Estado</dt>
                  <dd>
                    <Badge variant={quote.status === "CONVERTED" ? "success" : quote.status === "LOST" ? "destructive" : "outline"}>
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </Badge>
                  </dd>
                </div>
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Total</dt>
                  <dd className="text-lg font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, quote.totalCents)}</dd>
                </div>
              </dl>
              <div className="border-t pt-4">
                <QuoteDocumentButton
                  quoteId={quote.id}
                  company={company}
                  rate={currentRate}
                  currencyCode={currencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                />
              </div>
            </>
          )}
          empty={
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
              <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                <FileTextIcon className="size-5" />
              </div>
              <p className="text-sm text-muted-foreground">No se encontraron presupuestos.</p>
            </div>
          }
        />
        </>
      ) : (
        <>
        <MasterDetail
          items={filteredSales}
          label="Documentos"
          renderRowMobile={(sale) => (
            <MobileRow
              title={sale.customerFirstName ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim() : "—"}
              meta={`Nº ${controlNumberLabel(sale)} · ${formatDate(sale.createdAt)}`}
              badge={
                <Badge variant={sale.paymentStatus === "CREDIT" ? "destructive" : "success"}>
                  {sale.paymentStatus === "CREDIT" ? PAYMENT_STATUS_LABELS.CREDIT : PAYMENT_STATUS_LABELS.PAID}
                </Badge>
              }
              amount={
                <Price
                  eurCents={sale.totalCents}
                  rate={sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate}
                  currencyCode={currencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                  className="items-end"
                />
              }
            />
          )}
          renderRow={(sale) => (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
                <FileTextIcon className="size-4 text-muted-foreground/60" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {sale.customerFirstName ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim() : "—"}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  Nº {controlNumberLabel(sale)} · {formatDate(sale.createdAt)}
                </span>
              </span>
              <Badge variant={sale.paymentStatus === "CREDIT" ? "destructive" : "success"}>
                {sale.paymentStatus === "CREDIT" ? PAYMENT_STATUS_LABELS.CREDIT : PAYMENT_STATUS_LABELS.PAID}
              </Badge>
              <span className="flex w-28 shrink-0 justify-end text-sm">
                <Price
                  eurCents={sale.totalCents}
                  rate={sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate}
                  currencyCode={currencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                  className="items-end"
                />
              </span>
            </>
          )}
          renderDetail={(sale) => (
            <>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-lg font-semibold leading-tight">
                  {sale.customerFirstName ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim() : "—"}
                </h3>
                <p className="text-sm text-muted-foreground">Documento Nº {controlNumberLabel(sale)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Fecha</dt>
                  <dd className="font-medium">{formatDate(sale.createdAt)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Vendedor</dt>
                  <dd className="font-medium">{sale.sellerName ?? "—"}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Estado</dt>
                  <dd>
                    <Badge variant={sale.paymentStatus === "CREDIT" ? "destructive" : "success"}>
                      {sale.paymentStatus === "CREDIT" ? PAYMENT_STATUS_LABELS.CREDIT : PAYMENT_STATUS_LABELS.PAID}
                    </Badge>
                  </dd>
                </div>
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Total</dt>
                  <dd className="flex">
                    <Price
                      eurCents={sale.totalCents}
                      rate={sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate}
                      currencyCode={currencyCode}
                      exchangeRateEnabled={exchangeRateEnabled}
                      referenceCurrency={referenceCurrency}
                      size="lg"
                    />
                  </dd>
                </div>
              </dl>
              <div className="border-t pt-4">
                <SaleDocumentButtons
                  sale={sale}
                  company={company}
                  currentRate={currentRate}
                  currencyCode={currencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                  printPaperSize={printPaperSize}
                />
              </div>
            </>
          )}
          empty={
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
              <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                <FileTextIcon className="size-5" />
              </div>
              <p className="text-sm text-muted-foreground">No se encontraron documentos.</p>
            </div>
          }
        />
        </>
      )}
    </div>
  );
}

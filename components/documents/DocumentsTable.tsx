"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/money/Price";
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
  const inRange = (d: Date) => windows.some((w) => d >= w.start && d < w.end);

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
  }, [sales, query, docType, windows]);

  const filteredQuotes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (!inRange(new Date(quote.createdAt))) return false;
      const name = `${quote.customerFirstName ?? ""} ${quote.customerLastName ?? ""}`.toLowerCase();
      const label = quote.controlNumber != null ? String(quote.controlNumber) : quote.id.slice(-8);
      return !q || name.includes(q) || (quote.customerPhone ?? "").includes(q) || label.toLowerCase().includes(q);
    });
  }, [quotes, query, windows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Buscar por cliente, teléfono o Nº de control..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-sm"
          />
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
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Nº control</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Documento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>{formatDate(quote.createdAt)}</TableCell>
                  <TableCell>{quote.controlNumber ?? "—"}</TableCell>
                  <TableCell>
                    {quote.customerFirstName
                      ? `${quote.customerFirstName} ${quote.customerLastName ?? ""}`.trim()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={quote.status === "CONVERTED" ? "success" : quote.status === "LOST" ? "destructive" : "outline"}>
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrencyCents(referenceCurrency, quote.totalCents)}</TableCell>
                  <TableCell className="text-right">
                    <QuoteDocumentButton
                      quoteId={quote.id}
                      company={company}
                      rate={currentRate}
                      currencyCode={currencyCode}
                      exchangeRateEnabled={exchangeRateEnabled}
                      referenceCurrency={referenceCurrency}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredQuotes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No se encontraron presupuestos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Nº control</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Documentos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell>{formatDate(sale.createdAt)}</TableCell>
                  <TableCell>{controlNumberLabel(sale)}</TableCell>
                  <TableCell>
                    {sale.customerFirstName
                      ? `${sale.customerFirstName} ${sale.customerLastName ?? ""}`.trim()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{sale.sellerName ?? "—"}</TableCell>
                  <TableCell>
                    {sale.paymentStatus === "CREDIT" ? (
                      <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
                    ) : (
                      <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Price
                      eurCents={sale.totalCents}
                      rate={sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate}
                      currencyCode={currencyCode}
                      exchangeRateEnabled={exchangeRateEnabled}
                      referenceCurrency={referenceCurrency}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <SaleDocumentButtons
                      sale={sale}
                      company={company}
                      currentRate={currentRate}
                      currencyCode={currencyCode}
                      exchangeRateEnabled={exchangeRateEnabled}
                      referenceCurrency={referenceCurrency}
                      printPaperSize={printPaperSize}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredSales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No se encontraron documentos.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

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
import { PAYMENT_STATUS_LABELS, formatDate } from "@/lib/format";
import { controlNumberLabel, type DeliveryNoteCompany } from "@/lib/delivery-note";
import { rangeToDates, type DateRangePreset } from "@/lib/report-types";
import type { PaymentMethod, PaymentStatus, PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type DocTypeFilter = "all" | "invoice" | "receipt";

const DOC_TYPE_LABELS: Record<DocTypeFilter, string> = {
  all: "Todos los tipos",
  invoice: "Con factura",
  receipt: "Con recibo de pago",
};

type DateFilter = "all" | "today" | "7d" | "month";

const DATE_FILTER_LABELS: Record<DateFilter, string> = {
  all: "Cualquier fecha",
  today: "Hoy",
  "7d": "Esta semana",
  month: "Este mes",
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

export function DocumentsTable({
  sales,
  company,
  currentRate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
}: {
  sales: DocumentSale[];
  company: DeliveryNoteCompany;
  currentRate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
}) {
  const [query, setQuery] = useState("");
  const [docType, setDocType] = useState<DocTypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const range = dateFilter === "all" ? null : rangeToDates(dateFilter);
    return sales.filter((sale) => {
      const name = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.toLowerCase();
      const matchesQuery =
        !q ||
        name.includes(q) ||
        (sale.customerPhone ?? "").includes(q) ||
        controlNumberLabel(sale).toLowerCase().includes(q);
      const matchesType =
        docType === "all"
          ? true
          : docType === "invoice"
            ? sale.invoiceNumber != null
            : sale.receiptControlNumber != null;
      const createdAt = new Date(sale.createdAt);
      const matchesDate = !range || (createdAt >= range.start && createdAt <= range.end);
      return matchesQuery && matchesType && matchesDate;
    });
  }, [sales, query, docType, dateFilter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap">
        <Input
          placeholder="Buscar por cliente, teléfono o Nº de control..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={docType} onValueChange={(v) => setDocType((v as DocTypeFilter) ?? "all")}>
          <SelectTrigger>
            <SelectValue placeholder="Tipo de documento">
              {(value: string | null) => DOC_TYPE_LABELS[(value as DocTypeFilter) ?? "all"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DOC_TYPE_LABELS) as DocTypeFilter[]).map((k) => (
              <SelectItem key={k} value={k}>
                {DOC_TYPE_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter((v as DateFilter) ?? "all")}>
          <SelectTrigger>
            <SelectValue placeholder="Fecha">
              {(value: string | null) => DATE_FILTER_LABELS[(value as DateFilter) ?? "all"]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DATE_FILTER_LABELS) as DateFilter[]).map((k) => (
              <SelectItem key={k} value={k}>
                {DATE_FILTER_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
            {filtered.map((sale) => (
              <TableRow key={sale.id} className={sale.voided ? "opacity-50" : undefined}>
                <TableCell>
                  {formatDate(sale.createdAt)}
                  {sale.voided && (
                    <span className="block">
                      <Badge variant="destructive">Anulada</Badge>
                    </span>
                  )}
                </TableCell>
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
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No se encontraron documentos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

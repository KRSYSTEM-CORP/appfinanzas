"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
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
import type { PaymentMethod, PaymentStatus, PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type DocumentSale = {
  id: string;
  controlNumber: number | null;
  receiptControlNumber: number | null;
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sales;
    return sales.filter((sale) => {
      const name = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.toLowerCase();
      return (
        name.includes(q) ||
        (sale.customerPhone ?? "").includes(q) ||
        controlNumberLabel(sale).toLowerCase().includes(q)
      );
    });
  }, [sales, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        placeholder="Buscar por cliente, teléfono o Nº de control..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />
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

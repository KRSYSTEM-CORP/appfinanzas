"use client";

import { useState } from "react";
import { appendSheet, downloadWorkbook, newWorkbook } from "@/lib/spreadsheet";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

type CreditNoteRow = {
  createdAt: Date;
  controlNumber: number;
  reason: string;
  baseImponibleCents: number;
  taxCents: number;
  totalCents: number;
  igtfCents: number;
  sale: { invoiceNumber: number | null; customerFirstName: string | null; customerLastName: string | null; customerRif: string | null };
};

type DebitNoteRow = Omit<CreditNoteRow, "igtfCents">;

type SaleRow = {
  createdAt: Date;
  controlNumber: number | null;
  invoiceNumber: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerRif: string | null;
  baseImponibleCents: number;
  taxCents: number;
  totalCents: number;
  igtfCents?: number;
};

type PurchaseRow = {
  createdAt: Date;
  controlNumber: number | null;
  supplierInvoiceNo: string | null;
  supplier: { name: string; rif: string | null } | null;
  manualSupplierName: string | null;
  baseImponibleCents: number;
  taxCents: number;
  ivaRetainedCents: number;
  totalCents: number;
};

export function TaxBookExportButton({
  sales,
  purchases,
  creditNotes = [],
  debitNotes = [],
  rangeLabel,
}: {
  sales: SaleRow[];
  purchases: PurchaseRow[];
  creditNotes?: CreditNoteRow[];
  debitNotes?: DebitNoteRow[];
  rangeLabel: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const wb = newWorkbook();

      const salesSheet = ([
        ["Fecha", "Nº Control", "Nº Factura", "Cliente", "RIF/Cédula", "Base Imponible", "IVA", "Total", "IGTF"],
        ...sales.map((s) => [
          formatDate(s.createdAt),
          s.controlNumber ?? "",
          s.invoiceNumber ?? "",
          `${s.customerFirstName ?? ""} ${s.customerLastName ?? ""}`.trim(),
          s.customerRif ?? "",
          s.baseImponibleCents / 100,
          s.taxCents / 100,
          s.totalCents / 100,
          (s.igtfCents ?? 0) / 100,
        ]),
      ]);
      appendSheet(wb, salesSheet, "Libro de Ventas");

      if (debitNotes.length > 0) {
        appendSheet(wb, [
          ["Fecha", "Nº Nota de débito", "Factura afectada", "Cliente", "RIF/Cédula", "Motivo", "Base Imponible", "IVA", "Total"],
          ...debitNotes.map((n) => [
            formatDate(n.createdAt),
            n.controlNumber,
            n.sale.invoiceNumber ?? "",
            `${n.sale.customerFirstName ?? ""} ${n.sale.customerLastName ?? ""}`.trim(),
            n.sale.customerRif ?? "",
            n.reason,
            n.baseImponibleCents / 100,
            n.taxCents / 100,
            n.totalCents / 100,
          ]),
        ], "Notas de Débito");
      }
      if (creditNotes.length > 0) {
        appendSheet(wb, [
          ["Fecha", "Nº Nota de crédito", "Factura afectada", "Cliente", "RIF/Cédula", "Motivo", "Base Imponible", "IVA", "Total", "IGTF"],
          ...creditNotes.map((n) => [
            formatDate(n.createdAt),
            n.controlNumber,
            n.sale.invoiceNumber ?? "",
            `${n.sale.customerFirstName ?? ""} ${n.sale.customerLastName ?? ""}`.trim(),
            n.sale.customerRif ?? "",
            n.reason,
            -n.baseImponibleCents / 100,
            -n.taxCents / 100,
            -n.totalCents / 100,
            -n.igtfCents / 100,
          ]),
        ], "Notas de Crédito");
      }

      const purchasesSheet = ([
        ["Fecha", "Nº Control", "Nº Factura Proveedor", "Proveedor", "RIF", "Base Imponible", "IVA", "IVA Retenido", "Total"],
        ...purchases.map((p) => [
          formatDate(p.createdAt),
          p.controlNumber ?? "",
          p.supplierInvoiceNo ?? "",
          p.supplier?.name ?? p.manualSupplierName ?? "",
          p.supplier?.rif ?? "",
          p.baseImponibleCents / 100,
          p.taxCents / 100,
          p.ivaRetainedCents / 100,
          p.totalCents / 100,
        ]),
      ]);
      appendSheet(wb, purchasesSheet, "Libro de Compras");

      await downloadWorkbook(wb, `libro-iva-${rangeLabel}.xlsx`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button type="button" variant="outline" disabled={isExporting} onClick={handleExport}>
      {isExporting ? "Exportando..." : "Exportar a Excel"}
    </Button>
  );
}

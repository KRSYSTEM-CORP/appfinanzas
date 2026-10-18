"use client";

import { useState } from "react";
import { appendSheet, downloadWorkbook, newWorkbook } from "@/lib/spreadsheet";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

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
  rangeLabel,
}: {
  sales: SaleRow[];
  purchases: PurchaseRow[];
  rangeLabel: string;
}) {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const wb = newWorkbook();

      const salesSheet = ([
        ["Fecha", "Nº Control", "Nº Factura", "Cliente", "RIF/Cédula", "Base Imponible", "IVA", "Total"],
        ...sales.map((s) => [
          formatDate(s.createdAt),
          s.controlNumber ?? "",
          s.invoiceNumber ?? "",
          `${s.customerFirstName ?? ""} ${s.customerLastName ?? ""}`.trim(),
          s.customerRif ?? "",
          s.baseImponibleCents / 100,
          s.taxCents / 100,
          s.totalCents / 100,
        ]),
      ]);
      appendSheet(wb, salesSheet, "Libro de Ventas");

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

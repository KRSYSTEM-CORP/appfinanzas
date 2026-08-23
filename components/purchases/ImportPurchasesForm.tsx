"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BulkPurchaseRowSchema } from "@/lib/validations";
import { bulkImportPurchases, type BulkPurchaseResult } from "@/lib/actions/purchases";

const HEADER_MAP: Record<string, string> = {
  proveedor: "supplierName",
  supplier: "supplierName",
  "nº factura proveedor": "supplierInvoiceNo",
  "n factura proveedor": "supplierInvoiceNo",
  "factura proveedor": "supplierInvoiceNo",
  invoiceno: "supplierInvoiceNo",
  sku: "productSku",
  "sku o nombre del producto": "productSku",
  producto: "productName",
  "nombre del producto": "productName",
  productname: "productName",
  cantidad: "quantity",
  quantity: "quantity",
  "costo unitario": "unitCost",
  unitcost: "unitCost",
  costo: "unitCost",
  iva: "taxCategory",
  "categoria de iva": "taxCategory",
  taxcategory: "taxCategory",
  "forma de pago": "paymentStatus",
  paymentstatus: "paymentStatus",
  nota: "note",
  note: "note",
};

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

type ParsedRow = {
  row: number;
  supplierName?: unknown;
  supplierInvoiceNo?: unknown;
  productSku?: unknown;
  productName?: unknown;
  quantity?: unknown;
  unitCost?: unknown;
  taxCategory?: unknown;
  paymentStatus?: unknown;
  note?: unknown;
  error: string | null;
};

function parseWorkbook(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  return raw.map((rawRow, index) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      const canonical = HEADER_MAP[normalizeHeader(key)];
      if (canonical) mapped[canonical] = value;
    }
    const parsed = BulkPurchaseRowSchema.safeParse(mapped);
    return {
      row: index + 2,
      ...mapped,
      error: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Datos inválidos"),
    };
  });
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Proveedor", "Nº factura proveedor", "SKU", "Cantidad", "Costo unitario", "IVA", "Forma de pago", "Nota"],
    ["Distribuidora Central", "F-00123", "CAM-001", 20, 6.5, "General", "Contado", ""],
    ["Distribuidora Central", "F-00123", "PAN-002", 10, 3.2, "General", "Contado", ""],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Compras");
  XLSX.writeFile(wb, "plantilla-compras.xlsx");
}

export function ImportPurchasesForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkPurchaseResult | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWorkbook(buffer);
      if (parsed.length === 0) {
        setFileError("El archivo no tiene filas de compras.");
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch {
      setFileError("No se pudo leer el archivo. Verifica que sea un Excel válido (.xlsx).");
      setRows([]);
    }
  }

  const validRows = rows.filter((r) => !r.error);
  const invalidRows = rows.filter((r) => r.error);

  function confirmImport() {
    startTransition(async () => {
      const res = await bulkImportPurchases(
        validRows.map((r) => ({
          supplierName: r.supplierName,
          supplierInvoiceNo: r.supplierInvoiceNo,
          productSku: r.productSku,
          productName: r.productName,
          quantity: r.quantity,
          unitCost: r.unitCost,
          taxCategory: r.taxCategory,
          paymentStatus: r.paymentStatus,
          note: r.note,
        }))
      );
      setResult(res);
      setRows([]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-col gap-1.5 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Sube un archivo Excel (.xlsx) con tus compras. Las columnas esperadas son:{" "}
          <strong>Proveedor, Nº factura proveedor, SKU (o Producto), Cantidad, Costo unitario, IVA, Forma
          de pago, Nota</strong>{" "}
          (Proveedor, el producto, Cantidad y Costo unitario son obligatorios — el proveedor debe existir
          ya en <em>Proveedores</em>). Las filas con el mismo Proveedor y Nº de factura se agrupan en una
          sola compra con varios productos; si dejas la factura en blanco, cada fila se registra como una
          compra independiente.
        </p>
        <div className="flex gap-2 mt-2">
          <Button type="button" variant="outline" onClick={downloadTemplate}>
            Descargar plantilla
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            Seleccionar archivo
          </Button>
        </div>
        {fileError && <p className="text-sm text-destructive mt-2">{fileError}</p>}
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {validRows.length} fila{validRows.length === 1 ? "" : "s"} lista
              {validRows.length === 1 ? "" : "s"} para importar
              {invalidRows.length > 0 && (
                <span className="text-destructive">
                  {" "}
                  · {invalidRows.length} con errores (no se importarán)
                </span>
              )}
            </p>
            <Button type="button" disabled={validRows.length === 0 || isPending} onClick={confirmImport}>
              {isPending ? "Importando..." : "Confirmar importación"}
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Costo unit.</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.row} className={r.error ? "opacity-70" : undefined}>
                    <TableCell>{r.row}</TableCell>
                    <TableCell>{String(r.supplierName ?? "—")}</TableCell>
                    <TableCell>{String(r.supplierInvoiceNo ?? "—")}</TableCell>
                    <TableCell>{String(r.productSku ?? r.productName ?? "—")}</TableCell>
                    <TableCell>{String(r.quantity ?? "—")}</TableCell>
                    <TableCell>{String(r.unitCost ?? "—")}</TableCell>
                    <TableCell>
                      {r.error ? (
                        <Badge variant="destructive">{r.error}</Badge>
                      ) : (
                        <Badge variant="success">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border p-4 flex flex-col gap-1">
          <p className="text-sm">
            <strong>{result.created}</strong> compra{result.created === 1 ? "" : "s"} creada
            {result.created === 1 ? "" : "s"}.
          </p>
          {result.failed.length > 0 && (
            <p className="text-sm text-destructive">
              {result.failed.length} fila{result.failed.length === 1 ? "" : "s"} con errores:{" "}
              {result.failed.map((f) => `#${f.row} (${f.error})`).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

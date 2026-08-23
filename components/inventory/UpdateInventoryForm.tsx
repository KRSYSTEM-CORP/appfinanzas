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
import { ProductUpdateRowSchema } from "@/lib/validations";
import { bulkUpdateProducts, listAllProducts, type BulkUpdateResult } from "@/lib/actions/products";
import { TAX_CATEGORY_EXPORT_LABELS } from "@/lib/tax";

const HEADER_MAP: Record<string, string> = {
  id: "id",
  sku: "sku",
  nombre: "name",
  name: "name",
  categoria: "category",
  category: "category",
  precio: "price",
  "precio eur": "price",
  price: "price",
  costo: "cost",
  cost: "cost",
  "controlar stock": "trackStock",
  trackstock: "trackStock",
  stock: "stock",
  "umbral de stock bajo": "lowStockThreshold",
  umbral: "lowStockThreshold",
  lowstockthreshold: "lowStockThreshold",
  iva: "taxCategory",
  "categoria de iva": "taxCategory",
  taxcategory: "taxCategory",
  "precios por cantidad": "priceTiersEnabled",
  pricetiersenabled: "priceTiersEnabled",
  "precio mayor": "wholesalePrice",
  wholesaleprice: "wholesalePrice",
  "cantidad minima mayor": "wholesaleMinQty",
  wholesaleminqty: "wholesaleMinQty",
  "precio gran mayor": "bulkPrice",
  bulkprice: "bulkPrice",
  "cantidad minima gran mayor": "bulkMinQty",
  bulkminqty: "bulkMinQty",
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
  id?: unknown;
  sku?: unknown;
  name?: unknown;
  category?: unknown;
  price?: unknown;
  cost?: unknown;
  trackStock?: unknown;
  stock?: unknown;
  lowStockThreshold?: unknown;
  taxCategory?: unknown;
  priceTiersEnabled?: unknown;
  wholesalePrice?: unknown;
  wholesaleMinQty?: unknown;
  bulkPrice?: unknown;
  bulkMinQty?: unknown;
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
    const parsed = ProductUpdateRowSchema.safeParse(mapped);
    return {
      row: index + 2, // +1 for header row, +1 for 1-indexing
      ...mapped,
      error: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Datos inválidos"),
    };
  });
}

export function UpdateInventoryForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUpdateResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const products = await listAllProducts();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        [
          "ID",
          "SKU",
          "Nombre",
          "Categoría",
          "Precio",
          "Costo",
          "Controlar stock",
          "Stock",
          "Umbral de stock bajo",
          "IVA",
          "Precios por cantidad",
          "Precio mayor",
          "Cantidad mínima mayor",
          "Precio gran mayor",
          "Cantidad mínima gran mayor",
        ],
        ...products.map((p) => [
          p.id,
          p.sku ?? "",
          p.name,
          p.category ?? "",
          p.priceCents / 100,
          p.costCents != null ? p.costCents / 100 : "",
          p.trackStock ? "Sí" : "No",
          p.stock,
          p.lowStockThreshold,
          TAX_CATEGORY_EXPORT_LABELS[p.taxCategory],
          p.priceTiersEnabled ? "Sí" : "No",
          p.wholesalePriceCents != null ? p.wholesalePriceCents / 100 : "",
          p.wholesaleMinQty ?? "",
          p.bulkPriceCents != null ? p.bulkPriceCents / 100 : "",
          p.bulkMinQty ?? "",
        ]),
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "Inventario");
      XLSX.writeFile(wb, "inventario-actual.xlsx");
    } finally {
      setIsExporting(false);
    }
  }

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
        setFileError("El archivo no tiene filas de productos.");
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

  function confirmUpdate() {
    startTransition(async () => {
      const res = await bulkUpdateProducts(
        validRows.map((r) => ({
          id: r.id,
          sku: r.sku,
          name: r.name,
          category: r.category,
          price: r.price,
          cost: r.cost,
          trackStock: r.trackStock,
          stock: r.stock,
          lowStockThreshold: r.lowStockThreshold,
          taxCategory: r.taxCategory,
          priceTiersEnabled: r.priceTiersEnabled,
          wholesalePrice: r.wholesalePrice,
          wholesaleMinQty: r.wholesaleMinQty,
          bulkPrice: r.bulkPrice,
          bulkMinQty: r.bulkMinQty,
        }))
      );
      setResult(res);
      setRows([]);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <div className="flex flex-col gap-1.5 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Este proceso <strong>solo actualiza productos existentes</strong> — nunca crea productos
          nuevos. Descarga el inventario actual, edita lo que necesites y vuelve a subir el mismo
          archivo: la columna <strong>ID no debe editarse ni borrarse</strong> (identifica cada
          producto internamente). El SKU es opcional, igual que al crear o editar un producto a
          mano. Deja una columna en blanco para conservar el valor actual de ese campo.
        </p>
        <div className="flex gap-2 mt-2">
          <Button type="button" variant="outline" disabled={isExporting} onClick={handleExport}>
            {isExporting ? "Descargando..." : "Descargar inventario actual"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
          />
          <Button type="button" onClick={() => fileInputRef.current?.click()}>
            Subir archivo actualizado
          </Button>
        </div>
        {fileError && <p className="text-sm text-destructive mt-2">{fileError}</p>}
      </div>

      {rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              {validRows.length} fila{validRows.length === 1 ? "" : "s"} lista
              {validRows.length === 1 ? "" : "s"} para actualizar
              {invalidRows.length > 0 && (
                <span className="text-destructive">
                  {" "}
                  · {invalidRows.length} con errores (no se actualizarán)
                </span>
              )}
            </p>
            <Button type="button" disabled={validRows.length === 0 || isPending} onClick={confirmUpdate}>
              {isPending ? "Actualizando..." : "Confirmar actualización"}
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nombre nuevo</TableHead>
                  <TableHead>Precio nuevo</TableHead>
                  <TableHead>Stock nuevo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.row} className={r.error ? "opacity-70" : undefined}>
                    <TableCell>{r.row}</TableCell>
                    <TableCell>{String(r.sku ?? "—")}</TableCell>
                    <TableCell>{r.name ? String(r.name) : "—"}</TableCell>
                    <TableCell>{r.price !== undefined && r.price !== "" ? String(r.price) : "—"}</TableCell>
                    <TableCell>{r.stock !== undefined && r.stock !== "" ? String(r.stock) : "—"}</TableCell>
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
            <strong>{result.updated}</strong> producto{result.updated === 1 ? "" : "s"} actualizado
            {result.updated === 1 ? "" : "s"}.
          </p>
          {result.notFound.length > 0 && (
            <p className="text-sm text-destructive">
              {result.notFound.length} producto{result.notFound.length === 1 ? "" : "s"} no
              encontrado{result.notFound.length === 1 ? "" : "s"}:{" "}
              {result.notFound.map((f) => `#${f.row} (${f.label})`).join(", ")}
            </p>
          )}
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

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
import { ProductSchema } from "@/lib/validations";
import { bulkImportProducts, type BulkImportResult } from "@/lib/actions/products";

const HEADER_MAP: Record<string, string> = {
  nombre: "name",
  name: "name",
  sku: "sku",
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
  name?: unknown;
  sku?: unknown;
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
    const parsed = ProductSchema.safeParse(mapped);
    return {
      row: index + 2, // +1 for header row, +1 for 1-indexing
      ...mapped,
      error: parsed.success ? null : (parsed.error.issues[0]?.message ?? "Datos inválidos"),
    };
  });
}

function downloadTemplate() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
      "Nombre",
      "SKU",
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
    ["Camisa azul", "CAM-001", "Ropa", 12.5, 7, "Sí", 20, 5, "General", "No", "", "", "", ""],
    ["Camisa azul (al mayor)", "CAM-002", "Ropa", 12.5, 7, "Sí", 500, 20, "General", "Sí", 10, 51, 8, 100],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.writeFile(wb, "plantilla-productos.xlsx");
}

export function ImportProductsForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
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

  function confirmImport() {
    startTransition(async () => {
      const res = await bulkImportProducts(
        validRows.map((r) => ({
          name: r.name,
          sku: r.sku,
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
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex flex-col gap-1.5 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">
          Sube un archivo Excel (.xlsx) con tus productos. Las columnas esperadas son:{" "}
          <strong>Nombre, SKU, Categoría, Precio, Costo, Controlar stock, Stock, Umbral de stock bajo, IVA</strong>{" "}
          (Nombre y Precio son obligatorios; Stock solo si &quot;Controlar stock&quot; es &quot;Sí&quot;, que es el
          valor por defecto si dejas la columna en blanco). Opcionalmente,{" "}
          <strong>
            Precios por cantidad, Precio mayor, Cantidad mínima mayor, Precio gran mayor, Cantidad
            mínima gran mayor
          </strong>{" "}
          para activar precios al mayor/gran mayor. Si un SKU ya existe en tu inventario, ese
          producto se actualizará en vez de duplicarse.
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
              {validRows.length} producto{validRows.length === 1 ? "" : "s"} listo
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
                  <TableHead>Nombre</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.row} className={r.error ? "opacity-70" : undefined}>
                    <TableCell>{r.row}</TableCell>
                    <TableCell>{String(r.name ?? "—")}</TableCell>
                    <TableCell>{String(r.sku ?? "—")}</TableCell>
                    <TableCell>{String(r.category ?? "—")}</TableCell>
                    <TableCell>{String(r.price ?? "—")}</TableCell>
                    <TableCell>{String(r.stock ?? "—")}</TableCell>
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
            <strong>{result.created}</strong> producto{result.created === 1 ? "" : "s"} creado
            {result.created === 1 ? "" : "s"}, <strong>{result.updated}</strong> actualizado
            {result.updated === 1 ? "" : "s"}.
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

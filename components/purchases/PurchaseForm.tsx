"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Supplier, TaxCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPurchase } from "@/lib/actions/purchases";
import { TAX_CATEGORY_LABELS } from "@/lib/tax";
import { formatCurrencyCents } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

type PurchaseItemRow = {
  productId: string;
  quantity: string;
  unitCost: string;
  taxCategory: TaxCategory;
};

function emptyRow(defaultProductId: string, defaultTaxCategory: TaxCategory = "GENERAL"): PurchaseItemRow {
  return { productId: defaultProductId, quantity: "1", unitCost: "", taxCategory: defaultTaxCategory };
}

export function PurchaseForm({
  suppliers,
  products,
  referenceCurrency,
}: {
  suppliers: Supplier[];
  products: Product[];
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "PENDING">("PENDING");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PurchaseItemRow[]>([emptyRow(products[0]?.id ?? "")]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const productById = new Map(products.map((p) => [p.id, p]));

  function updateRow(index: number, patch: Partial<PurchaseItemRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow(products[0]?.id ?? "")]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function selectProduct(index: number, productId: string) {
    const product = productById.get(productId);
    updateRow(index, {
      productId,
      taxCategory: product?.taxCategory ?? "GENERAL",
      unitCost: product?.costCents != null ? (product.costCents / 100).toFixed(2) : rows[index].unitCost,
    });
  }

  const totalCents = rows.reduce((sum, r) => {
    const qty = Number(r.quantity) || 0;
    const cost = Math.round((Number(r.unitCost) || 0) * 100);
    return sum + qty * cost;
  }, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supplierId) {
      setError("Selecciona un proveedor");
      return;
    }
    startTransition(async () => {
      const result = await createPurchase({
        supplierId,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        paymentStatus,
        note: note || undefined,
        items: rows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
          unitCost: r.unitCost,
          taxCategory: r.taxCategory,
        })),
      });
      if (result.success) {
        router.push("/purchases");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplier">Proveedor</Label>
          <Select value={supplierId} onValueChange={(v) => v && setSupplierId(v)}>
            <SelectTrigger id="supplier">
              <SelectValue placeholder="Selecciona un proveedor">
                {(value: string | null) => suppliers.find((s) => s.id === value)?.name ?? "Selecciona"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suppliers.length === 0 && (
            <p className="text-xs text-destructive">Crea un proveedor primero.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="supplierInvoiceNo">Nº de factura del proveedor (opcional)</Label>
          <Input
            id="supplierInvoiceNo"
            value={supplierInvoiceNo}
            onChange={(e) => setSupplierInvoiceNo(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Productos comprados</Label>
        {rows.map((row, i) => {
          const product = productById.get(row.productId);
          return (
            <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`product-${i}`}>Producto</Label>
                  <Select value={row.productId} onValueChange={(v) => v && selectProduct(i, v)}>
                    <SelectTrigger id={`product-${i}`}>
                      <SelectValue placeholder="Selecciona un producto">
                        {(value: string | null) => productById.get(value ?? "")?.name ?? "Selecciona"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`tax-${i}`}>IVA</Label>
                  <Select
                    value={row.taxCategory}
                    onValueChange={(v) => v && updateRow(i, { taxCategory: v as TaxCategory })}
                  >
                    <SelectTrigger id={`tax-${i}`}>
                      <SelectValue placeholder="IVA">
                        {(value: string | null) => (value ? TAX_CATEGORY_LABELS[value as TaxCategory] : "IVA")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[]).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {TAX_CATEGORY_LABELS[cat]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`quantity-${i}`}>Cantidad</Label>
                  <Input
                    id={`quantity-${i}`}
                    type="number"
                    min="1"
                    step="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`unitCost-${i}`}>Costo unitario ({referenceCurrency})</Label>
                  <Input
                    id={`unitCost-${i}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(i, { unitCost: e.target.value })}
                  />
                </div>
              </div>
              {product && (
                <p className="text-xs text-muted-foreground">Stock actual: {product.stock}</p>
              )}
              {rows.length > 1 && (
                <Button type="button" size="sm" variant="ghost" className="self-end" onClick={() => removeRow(i)}>
                  Quitar
                </Button>
              )}
            </div>
          );
        })}
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          + Agregar otro producto
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>¿Cómo se pagó?</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={paymentStatus === "PAID" ? "default" : "outline"}
            onClick={() => setPaymentStatus("PAID")}
            className="flex-1"
          >
            Pagada de contado
          </Button>
          <Button
            type="button"
            variant={paymentStatus === "PENDING" ? "default" : "outline"}
            onClick={() => setPaymentStatus("PENDING")}
            className="flex-1"
          >
            A crédito (cuenta por pagar)
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Nota (opcional)</Label>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex items-center justify-between rounded-lg border p-3">
        <span className="text-sm text-muted-foreground">Total de la compra</span>
        <span className="font-semibold">{formatCurrencyCents(referenceCurrency, totalCents)}</span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending || suppliers.length === 0}>
          {isPending ? "Guardando..." : "Registrar compra"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/purchases")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

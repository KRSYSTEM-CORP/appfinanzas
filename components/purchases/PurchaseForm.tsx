"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Supplier, TaxCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentSplitBuilder, defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { createPurchase } from "@/lib/actions/purchases";
import { TAX_CATEGORY_LABELS, decomposeTax, rateForCategory } from "@/lib/tax";
import { formatCurrencyCents } from "@/lib/currencies";
import type { IvaSettingsInfo } from "@/lib/actions/settings";
import type { ReferenceCurrency } from "@prisma/client";

type PurchaseItemRow = {
  productId: string;
  quantity: string;
  unitCost: string;
  taxCategory: TaxCategory;
  affectsStock: boolean;
};

function emptyRow(defaultProductId: string, defaultTaxCategory: TaxCategory = "GENERAL"): PurchaseItemRow {
  return {
    productId: defaultProductId,
    quantity: "1",
    unitCost: "",
    taxCategory: defaultTaxCategory,
    affectsStock: true,
  };
}

export function PurchaseForm({
  suppliers,
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  ivaSettings,
}: {
  suppliers: Supplier[];
  products: Product[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  ivaSettings: IvaSettingsInfo;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "PENDING">("PENDING");
  const [paymentRows, setPaymentRows] = useState<PaymentSplitRow[]>(() =>
    defaultPaymentSplitRows(0, rate, exchangeRateEnabled)
  );
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

  // Same decomposition createPurchase runs server-side, so the payment
  // split below always targets what actually leaves the register — for a
  // "contribuyente especial" company, that's less than totalCents, since
  // the withheld IVA goes to SENIAT, not the supplier.
  const taxTotalCents = rows.reduce((sum, r) => {
    const qty = Number(r.quantity) || 0;
    const cost = Math.round((Number(r.unitCost) || 0) * 100);
    const taxRatePercent = rateForCategory(r.taxCategory, ivaSettings.ivaGeneralRatePercent, ivaSettings.ivaReducedRatePercent);
    return sum + decomposeTax(qty * cost, r.taxCategory, taxRatePercent).taxCents;
  }, 0);
  const ivaRetainedCents = ivaSettings.isIvaWithholdingAgent
    ? Math.round((taxTotalCents * ivaSettings.ivaWithholdingPercent) / 100)
    : 0;
  const amountOwedCents = totalCents - ivaRetainedCents;

  // Keep the single default payment row in sync with the purchase total as
  // rows/costs are edited, same pattern as the POS cart.
  useEffect(() => {
    setPaymentRows((prev) =>
      prev.length === 1 ? defaultPaymentSplitRows(amountOwedCents, rate, exchangeRateEnabled) : prev
    );
  }, [amountOwedCents, rate, exchangeRateEnabled]);

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
        payments:
          paymentStatus === "PAID"
            ? paymentRows.map((r) => ({
                paymentMethod: r.paymentMethod,
                amount: r.amount,
                paidInForeignCurrency: r.paidInForeignCurrency,
                reference: r.reference,
              }))
            : [],
        note: note || undefined,
        items: rows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
          unitCost: r.unitCost,
          taxCategory: r.taxCategory,
          affectsStock: r.affectsStock,
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-5xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border p-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="flex flex-col gap-1.5 lg:col-span-2">
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
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
                <div className="flex items-center justify-between gap-2">
                  {product && (
                    <p className="text-xs text-muted-foreground">Stock actual: {product.stock}</p>
                  )}
                  {rows.length > 1 && (
                    <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={() => removeRow(i)}>
                      Quitar
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Vincular al inventario</Label>
                <div className="flex w-fit rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => updateRow(i, { affectsStock: true })}
                    className={`px-3 py-1.5 text-sm ${row.affectsStock ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    Activado
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRow(i, { affectsStock: false })}
                    className={`px-3 py-1.5 text-sm ${!row.affectsStock ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    Desactivado
                  </button>
                </div>
                {!row.affectsStock && (
                  <p className="text-xs text-muted-foreground">
                    Esta línea quedará en el libro de compras pero no sumará al stock del producto.
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <Button type="button" size="sm" variant="outline" onClick={addRow}>
          + Agregar otro producto
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">Nota (opcional)</Label>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total de la compra</span>
          <span className="font-semibold">{formatCurrencyCents(referenceCurrency, totalCents)}</span>
        </div>
        {ivaRetainedCents > 0 && (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>IVA retenido</span>
              <span>−{formatCurrencyCents(referenceCurrency, ivaRetainedCents)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Monto a pagar al proveedor</span>
              <span>{formatCurrencyCents(referenceCurrency, amountOwedCents)}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>¿Cómo se pagó?</Label>
        <div className="flex flex-col sm:flex-row gap-2">
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

        {paymentStatus === "PAID" ? (
          <PaymentSplitBuilder
            rows={paymentRows}
            onChange={setPaymentRows}
            totalCents={amountOwedCents}
            rate={rate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            idPrefix="purchase"
          />
        ) : (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">
            Esta compra quedará pendiente de pago (cuenta por pagar). Márcala como pagada desde el
            historial de Compras cuando le pagues al proveedor.
          </p>
        )}
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

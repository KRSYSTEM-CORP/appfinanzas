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
import { quickCreateProduct } from "@/lib/actions/products";
import { TAX_CATEGORY_LABELS, decomposeTax, rateForCategory } from "@/lib/tax";
import { formatCurrencyCents } from "@/lib/currencies";
import { tryToEurCents } from "@/lib/payment-currency";
import type { IvaSettingsInfo } from "@/lib/actions/settings";
import type { ReferenceCurrency } from "@prisma/client";

// Only the fields this form actually reads off a product — lets a row
// created via "+ Crear producto nuevo" (quickCreateProduct's pared-down
// return value) slot into the same local `products` list as the full
// Product rows loaded from the server, with no unsound cast.
type PurchaseProduct = Pick<Product, "id" | "name" | "costCents" | "taxCategory" | "stock">;

type PurchaseItemRow = {
  productId: string;
  quantity: string;
  unitCost: string;
  // true = unitCost is typed directly in the reference currency (Euro/Dólar
  // BCV) — the only option before this toggle existed, kept as the default.
  unitCostInForeignCurrency: boolean;
  taxCategory: TaxCategory;
  affectsStock: boolean;
};

function emptyRow(defaultProductId: string, defaultTaxCategory: TaxCategory = "GENERAL"): PurchaseItemRow {
  return {
    productId: defaultProductId,
    quantity: "1",
    unitCost: "",
    unitCostInForeignCurrency: true,
    taxCategory: defaultTaxCategory,
    affectsStock: true,
  };
}

// Small Bolívares/Divisas toggle, shared visual pattern between the per-line
// unit cost and the invoice amount below — only meaningful while the company
// tracks a separate local currency at all (exchangeRateEnabled).
function CurrencyToggle({
  inForeignCurrency,
  onChange,
  referenceCurrency,
}: {
  inForeignCurrency: boolean;
  onChange: (v: boolean) => void;
  referenceCurrency: string;
}) {
  return (
    <div className="flex w-fit rounded-md border overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`px-3 py-1.5 text-sm ${!inForeignCurrency ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
      >
        Bolívares
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`px-3 py-1.5 text-sm ${inForeignCurrency ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
      >
        Divisas ({referenceCurrency})
      </button>
    </div>
  );
}

export function PurchaseForm({
  suppliers,
  products: initialProducts,
  categories,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  ivaSettings,
}: {
  suppliers: Supplier[];
  products: PurchaseProduct[];
  categories: string[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  ivaSettings: IvaSettingsInfo;
}) {
  const router = useRouter();
  // Local copy so a product created inline (see "+ Crear producto nuevo"
  // below) can be added to the picker right away, without a full reload.
  const [products, setProducts] = useState<PurchaseProduct[]>(initialProducts);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  // A one-off supplier typed just for this purchase — never saved as a real
  // Supplier record (see Purchase.manualSupplierName). Mutually exclusive
  // with supplierId; only one is ever sent to createPurchase.
  const [useManualSupplier, setUseManualSupplier] = useState(false);
  const [manualSupplierName, setManualSupplierName] = useState("");
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "PENDING">("PENDING");
  const [paymentRows, setPaymentRows] = useState<PaymentSplitRow[]>(() =>
    defaultPaymentSplitRows(0, rate, exchangeRateEnabled)
  );
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<PurchaseItemRow[]>([emptyRow(initialProducts[0]?.id ?? "")]);
  // Which row's "+ Crear producto nuevo" panel is open, and its draft
  // fields — null means none is open. Only one at a time, kept simple since
  // opening a new one just replaces whichever was open.
  const [newProductRow, setNewProductRow] = useState<number | null>(null);
  const [newProductDraft, setNewProductDraft] = useState({ name: "", category: "", price: "", cost: "", taxCategory: "GENERAL" as TaxCategory });
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newProductError, setNewProductError] = useState<string | null>(null);
  // The real total on the supplier's paper invoice — see PurchaseSchema's
  // invoiceAmount doc-comment. Defaults to the reference currency, same as
  // the per-line cost default.
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceAmountInForeignCurrency, setInvoiceAmountInForeignCurrency] = useState(true);
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

  function openNewProduct(index: number) {
    setNewProductRow(index);
    setNewProductError(null);
    setNewProductDraft({ name: "", category: "", price: "", cost: "", taxCategory: rows[index].taxCategory });
  }

  function submitNewProduct() {
    if (newProductRow == null) return;
    const rowIndex = newProductRow;
    const name = newProductDraft.name.trim();
    if (!name) {
      setNewProductError("El nombre es obligatorio");
      return;
    }
    const priceCents = Math.round((Number(newProductDraft.price) || 0) * 100);
    const costCents = newProductDraft.cost ? Math.round(Number(newProductDraft.cost) * 100) : undefined;
    setCreatingProduct(true);
    setNewProductError(null);
    startTransition(async () => {
      const result = await quickCreateProduct({
        name,
        category: newProductDraft.category || undefined,
        price: priceCents,
        cost: costCents,
        taxCategory: newProductDraft.taxCategory,
      });
      setCreatingProduct(false);
      if (!result.success) {
        setNewProductError(result.error);
        return;
      }
      const created = result.product;
      setProducts((prev) => [...prev, created]);
      updateRow(rowIndex, {
        productId: created.id,
        taxCategory: created.taxCategory,
        unitCost: created.costCents != null ? (created.costCents / 100).toFixed(2) : rows[rowIndex].unitCost,
        unitCostInForeignCurrency: true,
      });
      setNewProductRow(null);
    });
  }

  function selectProduct(index: number, productId: string) {
    const product = productById.get(productId);
    updateRow(index, {
      productId,
      taxCategory: product?.taxCategory ?? "GENERAL",
      unitCost: product?.costCents != null ? (product.costCents / 100).toFixed(2) : rows[index].unitCost,
      unitCostInForeignCurrency: true,
    });
  }

  // Resolves one line's typed cost to reference-currency cents, mirroring
  // createPurchase's own toEurCents call — an estimate for the live preview
  // only; the server always redoes this with the exchange rate on file at
  // save time.
  function unitCostEurCents(row: PurchaseItemRow): number {
    const raw = Math.round((Number(row.unitCost) || 0) * 100);
    return tryToEurCents(raw, row.unitCostInForeignCurrency ? referenceCurrency : currencyCode, rate, referenceCurrency) ?? 0;
  }

  const estimatedTotalCents = rows.reduce((sum, r) => sum + unitCostEurCents(r) * (Number(r.quantity) || 0), 0);
  const estimatedTaxTotalCents = rows.reduce((sum, r) => {
    const subtotalCents = unitCostEurCents(r) * (Number(r.quantity) || 0);
    const taxRatePercent = rateForCategory(r.taxCategory, ivaSettings.ivaGeneralRatePercent, ivaSettings.ivaReducedRatePercent);
    return sum + decomposeTax(subtotalCents, r.taxCategory, taxRatePercent).taxCents;
  }, 0);

  // The invoice amount is what actually becomes Purchase.totalCents — same
  // proportional rescale createPurchase applies server-side, so this preview
  // (and the payment split it feeds) matches exactly what gets saved.
  const invoiceTotalCents =
    tryToEurCents(
      Math.round((Number(invoiceAmount) || 0) * 100),
      invoiceAmountInForeignCurrency ? referenceCurrency : currencyCode,
      rate,
      referenceCurrency
    ) ?? 0;
  const scale = estimatedTotalCents > 0 ? invoiceTotalCents / estimatedTotalCents : 1;
  const taxTotalCents =
    estimatedTotalCents > 0 ? Math.round(estimatedTaxTotalCents * scale) : estimatedTaxTotalCents;
  const ivaRetainedCents = ivaSettings.isIvaWithholdingAgent
    ? Math.round((taxTotalCents * ivaSettings.ivaWithholdingPercent) / 100)
    : 0;
  const amountOwedCents = invoiceTotalCents - ivaRetainedCents;

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
    if (useManualSupplier ? !manualSupplierName.trim() : !supplierId) {
      setError(useManualSupplier ? "Escribe el nombre del proveedor" : "Selecciona un proveedor");
      return;
    }
    if (!invoiceAmount || Number(invoiceAmount) <= 0) {
      setError("Ingresa el monto de la factura");
      return;
    }
    startTransition(async () => {
      const result = await createPurchase({
        supplierId: useManualSupplier ? undefined : supplierId,
        manualSupplierName: useManualSupplier ? manualSupplierName.trim() : undefined,
        supplierInvoiceNo: supplierInvoiceNo || undefined,
        invoiceAmount,
        invoiceAmountInForeignCurrency,
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
          unitCostInForeignCurrency: r.unitCostInForeignCurrency,
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
          <div className="flex w-fit rounded-md border overflow-hidden">
            <button
              type="button"
              onClick={() => setUseManualSupplier(false)}
              className={`px-3 py-1.5 text-sm ${!useManualSupplier ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Registrado
            </button>
            <button
              type="button"
              onClick={() => setUseManualSupplier(true)}
              className={`px-3 py-1.5 text-sm ${useManualSupplier ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Proveedor manual
            </button>
          </div>
          {useManualSupplier ? (
            <>
              <Input
                id="supplier"
                placeholder="Nombre del proveedor"
                value={manualSupplierName}
                onChange={(e) => setManualSupplierName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Solo queda anotado en esta compra — no crea un proveedor nuevo en tu lista.
              </p>
            </>
          ) : (
            <>
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
                <p className="text-xs text-destructive">
                  No tienes proveedores registrados — crea uno o usa "Proveedor manual".
                </p>
              )}
            </>
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
                  <button
                    type="button"
                    onClick={() => (newProductRow === i ? setNewProductRow(null) : openNewProduct(i))}
                    className="text-xs text-left text-primary underline underline-offset-4 w-fit"
                  >
                    {newProductRow === i ? "Cancelar" : "+ Crear producto nuevo"}
                  </button>
                  {newProductRow === i && (
                    <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5 mt-1">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          placeholder="Nombre del producto"
                          value={newProductDraft.name}
                          onChange={(e) => setNewProductDraft((d) => ({ ...d, name: e.target.value }))}
                        />
                        <Input
                          list="purchase-category-options"
                          placeholder="Categoría (opcional)"
                          value={newProductDraft.category}
                          onChange={(e) => setNewProductDraft((d) => ({ ...d, category: e.target.value }))}
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={`Precio de venta (${referenceCurrency})`}
                          value={newProductDraft.price}
                          onChange={(e) => setNewProductDraft((d) => ({ ...d, price: e.target.value }))}
                        />
                        <Select
                          value={newProductDraft.taxCategory}
                          onValueChange={(v) => v && setNewProductDraft((d) => ({ ...d, taxCategory: v as TaxCategory }))}
                        >
                          <SelectTrigger>
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
                      {newProductError && <p className="text-xs text-destructive">{newProductError}</p>}
                      <Button type="button" size="sm" disabled={creatingProduct} onClick={submitNewProduct}>
                        {creatingProduct ? "Creando..." : "Crear y usar en esta línea"}
                      </Button>
                    </div>
                  )}
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
                  <Label htmlFor={`unitCost-${i}`}>
                    Costo unitario ({exchangeRateEnabled && !row.unitCostInForeignCurrency ? currencyCode : referenceCurrency})
                  </Label>
                  <Input
                    id={`unitCost-${i}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(i, { unitCost: e.target.value })}
                  />
                  {exchangeRateEnabled && (
                    <>
                      <CurrencyToggle
                        inForeignCurrency={row.unitCostInForeignCurrency}
                        onChange={(v) => updateRow(i, { unitCostInForeignCurrency: v })}
                        referenceCurrency={referenceCurrency}
                      />
                      {!row.unitCostInForeignCurrency && row.unitCost && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatCurrencyCents(referenceCurrency, unitCostEurCents(row))}
                          {rate == null && " — configura la tasa de cambio para convertir"}
                        </p>
                      )}
                    </>
                  )}
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

      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Total estimado según productos</span>
          <span>{formatCurrencyCents(referenceCurrency, estimatedTotalCents)}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invoiceAmount">
            Monto de la factura ({exchangeRateEnabled && !invoiceAmountInForeignCurrency ? currencyCode : referenceCurrency})
          </Label>
          <Input
            id="invoiceAmount"
            type="number"
            min="0"
            step="0.01"
            value={invoiceAmount}
            onChange={(e) => setInvoiceAmount(e.target.value)}
          />
          {exchangeRateEnabled && (
            <>
              <CurrencyToggle
                inForeignCurrency={invoiceAmountInForeignCurrency}
                onChange={setInvoiceAmountInForeignCurrency}
                referenceCurrency={referenceCurrency}
              />
              {!invoiceAmountInForeignCurrency && invoiceAmount && (
                <p className="text-xs text-muted-foreground">
                  ≈ {formatCurrencyCents(referenceCurrency, invoiceTotalCents)}
                  {rate == null && " — configura la tasa de cambio para convertir"}
                </p>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground">
            El monto real de la factura del proveedor — este es el total que queda registrado en la compra,
            no la suma de los productos de arriba (que solo estima el costo por producto).
          </p>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm text-muted-foreground">Total de la compra</span>
          <span className="font-semibold">{formatCurrencyCents(referenceCurrency, invoiceTotalCents)}</span>
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
        <Button type="submit" disabled={isPending || (!useManualSupplier && suppliers.length === 0)}>
          {isPending ? "Guardando..." : "Registrar compra"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/purchases")}>
          Cancelar
        </Button>
      </div>

      <datalist id="purchase-category-options">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </form>
  );
}

"use client";

import { accountChoiceMessage } from "@/lib/payment-method-accounts";
import { InsufficientFundsNotice, type FundsError } from "@/components/accounts/InsufficientFundsNotice";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, Supplier, TaxCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { SectionCard } from "@/components/shared/SectionCard";
import { Pill } from "@/components/shared/Pills";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaymentSplitBuilder, defaultPaymentSplitRows, type PaymentSplitRow, type SourceAccount } from "@/components/payments/PaymentSplitBuilder";
import { useDefaultPaymentRow } from "@/components/payments/useDefaultPaymentRow";
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

// Bolívares/Divisas: solo tiene sentido mientras la empresa maneje una moneda local aparte
// (exchangeRateEnabled). Se comparte entre el costo de cada línea y el monto de la factura.
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
    <Segmented
      label="Moneda"
      value={inForeignCurrency ? "fx" : "local"}
      onChange={(v) => onChange(v === "fx")}
      options={[
        { value: "local", label: "Bolívares" },
        { value: "fx", label: `Divisas (${referenceCurrency})` },
      ]}
    />
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
  sourceAccounts = [],
}: {
  sourceAccounts?: SourceAccount[];
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
  const [fundsFailure, setFundsFailure] = useState<FundsError | null>(null);
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
  useDefaultPaymentRow(amountOwedCents, rate, exchangeRateEnabled, setPaymentRows);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFundsFailure(null);
    if (paymentStatus === "PAID") {
      for (const r of paymentRows) {
        const missing = accountChoiceMessage(r.paymentMethod, sourceAccounts, r.paymentAccountId);
        if (missing) {
          setError(missing);
          return;
        }
      }
    }
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
                paymentAccountId: r.paymentAccountId || undefined,
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
      } else if (result.code === "INSUFFICIENT_FUNDS") {
        setFundsFailure(result);
      } else {
        setError(result.error);
      }
    });
  }

  const lbl = "text-[13px] font-semibold";
  const cost = (row: PurchaseItemRow) => (exchangeRateEnabled && !row.unitCostInForeignCurrency ? currencyCode : referenceCurrency);

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <SectionCard title="Proveedor" subtitle="¿A quién le compraste?">
          <Segmented
            label="Tipo de proveedor"
            value={useManualSupplier ? "manual" : "reg"}
            onChange={(v) => setUseManualSupplier(v === "manual")}
            options={[
              { value: "reg", label: "Registrado" },
              { value: "manual", label: "Proveedor manual" },
            ]}
          />
          <div className="mt-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier" className={lbl}>
                Proveedor
              </Label>
              {useManualSupplier ? (
                <>
                  <Input id="supplier" placeholder="Nombre del proveedor" value={manualSupplierName} onChange={(e) => setManualSupplierName(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Solo queda anotado en esta compra: no crea un proveedor nuevo en tu lista.</p>
                </>
              ) : (
                <>
                  <Select value={supplierId} onValueChange={(v) => v && setSupplierId(v)}>
                    <SelectTrigger id="supplier" className="w-full">
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
                    <p className="text-xs text-destructive">No tienes proveedores registrados: crea uno o usa «Proveedor manual».</p>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplierInvoiceNo" className={lbl}>
                Nº de factura del proveedor <span className="font-normal text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="supplierInvoiceNo" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Productos comprados"
          subtitle={`${rows.length} ${rows.length === 1 ? "línea" : "líneas"} · costo estimado ${formatCurrencyCents(referenceCurrency, estimatedTotalCents)}`}
          action={
            <Button type="button" size="sm" variant="outline" onClick={addRow}>
              + Agregar producto
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            {rows.map((row, i) => {
              const product = productById.get(row.productId);
              return (
                <div key={i} className="flex flex-col gap-3 rounded-[16px] bg-muted/60 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone="val">Línea {i + 1}</Pill>
                    <div className="flex items-center gap-2">
                      {product && <span className="text-xs text-muted-foreground">Stock actual: {product.stock}</span>}
                      {rows.length > 1 && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeRow(i)}>
                          Quitar
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <Label htmlFor={`product-${i}`} className={lbl}>
                        Producto
                      </Label>
                      <Select value={row.productId} onValueChange={(v) => v && selectProduct(i, v)}>
                        <SelectTrigger id={`product-${i}`} className="w-full">
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
                        className="w-fit text-left text-xs font-semibold text-primary"
                      >
                        {newProductRow === i ? "Cancelar" : "+ Crear producto nuevo"}
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`tax-${i}`} className={lbl}>
                        IVA
                      </Label>
                      <Select value={row.taxCategory} onValueChange={(v) => v && updateRow(i, { taxCategory: v as TaxCategory })}>
                        <SelectTrigger id={`tax-${i}`} className="w-full">
                          <SelectValue placeholder="IVA">{(value: string | null) => (value ? TAX_CATEGORY_LABELS[value as TaxCategory] : "IVA")}</SelectValue>
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
                      <Label htmlFor={`quantity-${i}`} className={lbl}>
                        Cantidad
                      </Label>
                      <Input id={`quantity-${i}`} type="number" min="1" step="1" value={row.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value })} />
                    </div>
                  </div>

                  {newProductRow === i && (
                    <div className="flex flex-col gap-2.5 rounded-[14px] border-2 border-dashed border-primary/40 bg-card p-3">
                      <p className="text-[13px] font-bold">Producto nuevo</p>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                        <Input placeholder="Nombre del producto" value={newProductDraft.name} onChange={(e) => setNewProductDraft((d) => ({ ...d, name: e.target.value }))} />
                        <Input list="purchase-category-options" placeholder="Categoría (opcional)" value={newProductDraft.category} onChange={(e) => setNewProductDraft((d) => ({ ...d, category: e.target.value }))} />
                        <Input type="number" min="0" step="0.01" placeholder={`Precio de venta (${referenceCurrency})`} value={newProductDraft.price} onChange={(e) => setNewProductDraft((d) => ({ ...d, price: e.target.value }))} />
                        <Select value={newProductDraft.taxCategory} onValueChange={(v) => v && setNewProductDraft((d) => ({ ...d, taxCategory: v as TaxCategory }))}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="IVA">{(value: string | null) => (value ? TAX_CATEGORY_LABELS[value as TaxCategory] : "IVA")}</SelectValue>
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
                      <Button type="button" size="sm" disabled={creatingProduct} onClick={submitNewProduct} className="w-fit">
                        {creatingProduct ? "Creando..." : "Crear y usar en esta línea"}
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`unitCost-${i}`} className={lbl}>
                        Costo unitario ({cost(row)})
                      </Label>
                      <Input id={`unitCost-${i}`} type="number" min="0" step="0.01" value={row.unitCost} onChange={(e) => updateRow(i, { unitCost: e.target.value })} />
                      {exchangeRateEnabled && (
                        <>
                          <CurrencyToggle inForeignCurrency={row.unitCostInForeignCurrency} onChange={(v) => updateRow(i, { unitCostInForeignCurrency: v })} referenceCurrency={referenceCurrency} />
                          {!row.unitCostInForeignCurrency && row.unitCost && (
                            <p className="text-xs text-muted-foreground">
                              ≈ {formatCurrencyCents(referenceCurrency, unitCostEurCents(row))}
                              {rate == null && " — configura la tasa de cambio para convertir"}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className={lbl}>Vincular al inventario</span>
                      <Segmented
                        label="Vincular al inventario"
                        value={row.affectsStock ? "on" : "off"}
                        onChange={(v) => updateRow(i, { affectsStock: v === "on" })}
                        options={[
                          { value: "on", label: "Activado" },
                          { value: "off", label: "Desactivado" },
                        ]}
                      />
                      {!row.affectsStock && (
                        <p className="text-xs text-muted-foreground">Queda en el libro de compras pero no suma al stock del producto.</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="¿Cómo se pagó?" subtitle="Elige de dónde salió el dinero para descontarlo de tus cuentas">
          <Segmented
            label="Forma de pago"
            value={paymentStatus}
            onChange={(v) => setPaymentStatus(v)}
            options={[
              { value: "PAID", label: "Pagada de contado" },
              { value: "PENDING", label: "A crédito (cuenta por pagar)" },
            ]}
          />
          <div className="mt-3.5">
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
                accounts={sourceAccounts}
              />
            ) : (
              <p className="rounded-[14px] bg-muted p-3.5 text-sm text-muted-foreground">
                Esta compra quedará pendiente de pago (cuenta por pagar). Págala después desde Órdenes de pago o desde el historial de Compras.
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Nota" subtitle="Opcional">
          <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. entrega parcial, descuento pactado…" />
        </SectionCard>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
        <SectionCard title="Resumen de la compra" subtitle="Lo que queda registrado">
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Total estimado según productos</span>
              <span className="tabular-nums">{formatCurrencyCents(referenceCurrency, estimatedTotalCents)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoiceAmount" className={lbl}>
                Monto de la factura ({exchangeRateEnabled && !invoiceAmountInForeignCurrency ? currencyCode : referenceCurrency})
              </Label>
              <Input id="invoiceAmount" type="number" min="0" step="0.01" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} />
              {exchangeRateEnabled && (
                <>
                  <CurrencyToggle inForeignCurrency={invoiceAmountInForeignCurrency} onChange={setInvoiceAmountInForeignCurrency} referenceCurrency={referenceCurrency} />
                  {!invoiceAmountInForeignCurrency && invoiceAmount && (
                    <p className="text-xs text-muted-foreground">
                      ≈ {formatCurrencyCents(referenceCurrency, invoiceTotalCents)}
                      {rate == null && " — configura la tasa de cambio para convertir"}
                    </p>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground">El total real de la factura del proveedor: es el que queda registrado, no la suma estimada de los productos.</p>
            </div>
            <div className="flex items-end justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">Total de la compra</span>
              <span className="text-[28px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{formatCurrencyCents(referenceCurrency, invoiceTotalCents)}</span>
            </div>
            {ivaRetainedCents > 0 && (
              <>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>IVA retenido</span>
                  <span className="tabular-nums">−{formatCurrencyCents(referenceCurrency, ivaRetainedCents)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Monto a pagar al proveedor</span>
                  <span className="tabular-nums">{formatCurrencyCents(referenceCurrency, amountOwedCents)}</span>
                </div>
              </>
            )}
            <Pill tone={paymentStatus === "PAID" ? "ok" : "warn"} className="w-fit">
              {paymentStatus === "PAID" ? "Pagada de contado" : "A crédito · cuenta por pagar"}
            </Pill>
            {error && (
              <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
                {error}
              </p>
            )}
            {fundsFailure && (
              <InsufficientFundsNotice
                failure={fundsFailure}
                accounts={sourceAccounts}
                onFunded={() => {
                  setFundsFailure(null);
                  router.refresh();
                }}
              />
            )}
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Button type="submit" size="lg" className="flex-1" disabled={isPending || (!useManualSupplier && suppliers.length === 0)}>
                {isPending ? "Guardando..." : "Registrar compra"}
              </Button>
              <Button type="button" size="lg" variant="outline" className="flex-1" onClick={() => router.push("/purchases")}>
                Cancelar
              </Button>
            </div>
          </div>
        </SectionCard>
      </aside>

      <datalist id="purchase-category-options">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </form>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import type { PaymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart } from "@/components/pos/Cart";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { OfflineSyncBanner } from "@/components/pos/OfflineSyncBanner";
import { defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { computeItemDiscountCents } from "@/lib/discount";
import { queueSale, type PendingSaleInput } from "@/lib/offline/sync";
import { buildPendingReceipt } from "@/lib/offline/pending-receipt";
import { useCart } from "@/lib/pos/use-cart";
import { getCatalogSnapshot } from "@/lib/offline/db";
import { readLastBranch } from "@/lib/offline/use-catalog-sync";
import type { CatalogSnapshot } from "@/lib/offline/db";

type Step = "customer" | "cart" | "receipt";

// How stale a catalog snapshot is allowed to look before the freshness note
// switches from "hace X minutos" to a plainer "hace más de un día" — purely
// cosmetic, doesn't block anything (see the plan: staleness is handled by
// blocking + manual review at sync time, not by refusing to sell here).
function timeAgoLabel(savedAt: string): string {
  const ms = Date.now() - new Date(savedAt).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

// The offline-only POS screen — served by the service worker (see
// public/sw.js) when a navigation to "/", "/pos" or this page itself fails
// because there's no network. Deliberately much smaller than PosClient: no
// quote conversion, no live-refresh subscription, no online/completeSale
// branch (checkout here always queues, see lib/offline/sync.ts), no Factura
// generation — all reasonable to skip while offline, per the scope this was
// built for. Everything it shows comes from the CatalogSnapshot the real
// (online) /pos page keeps warm in IndexedDB (see lib/offline/use-catalog-sync.ts) —
// there is nothing to fetch from the server here, by design.
export function PosOfflineClient() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null);

  useEffect(() => {
    const last = readLastBranch();
    if (!last) {
      setLoading(false);
      return;
    }
    getCatalogSnapshot(last.branchId).then((snap) => {
      setSnapshot(snap ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando...</div>;
  }

  if (!snapshot) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-[calc(100vh-56px)] p-6 text-center">
        <h2 className="text-lg font-semibold">Sin conexión</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Todavía no hay un catálogo guardado en este dispositivo para vender sin internet.
          Conéctate una vez con este equipo para cargarlo — después podrás seguir vendiendo aunque
          se corte la conexión.
        </p>
      </div>
    );
  }

  return <PosOfflineCheckout snapshot={snapshot} />;
}

function PosOfflineCheckout({ snapshot }: { snapshot: CatalogSnapshot }) {
  const productById = new Map(snapshot.products.map((p) => [p.id, p]));
  const {
    lines,
    addProduct,
    increment,
    decrement,
    setQuantity,
    setPriceTier,
    remove,
    maxStockFor,
    reset: resetCart,
  } = useCart([]);
  const [step, setStep] = useState<Step>("customer");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PAID");
  const [paymentRows, setPaymentRows] = useState<PaymentSplitRow[]>(() =>
    defaultPaymentSplitRows(0, snapshot.rate, snapshot.exchangeRateEnabled)
  );
  const [note, setNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [completedSale, setCompletedSale] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const rawTotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const discountValue = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountCentsTotal = lines.reduce(
    (sum, l) => sum + computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
    0
  );
  const total = rawTotal - discountCentsTotal;

  useEffect(() => {
    setPaymentRows((prev) =>
      prev.length === 1 ? defaultPaymentSplitRows(total, snapshot.rate, snapshot.exchangeRateEnabled) : prev
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  function continueFromCustomer(info: CustomerInfo) {
    setCustomer(info);
    setStep("cart");
  }

  function checkout() {
    if (!customer) return;
    const saleInput: PendingSaleInput = {
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        priceTier: l.priceTierOverride ?? undefined,
      })),
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
      discountPercent: discountValue,
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      customerRif: customer.rif || undefined,
      note: note.trim() || undefined,
    };

    startTransition(async () => {
      await queueSale(saleInput, {
        totalCents: total,
        items: lines.map((l) => ({
          productName: productById.get(l.productId)?.name ?? l.name,
          category: productById.get(l.productId)?.category ?? null,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          subtotalCents:
            l.unitPriceCents * l.quantity - computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
        })),
        sellerName: snapshot.sellerName,
        note: note.trim() || null,
      });
      setCompletedSale(
        buildPendingReceipt({
          lines: lines.map((l) => {
            const product = productById.get(l.productId);
            return {
              productId: l.productId,
              name: product?.name ?? l.name,
              category: product?.category ?? null,
              taxCategory: product?.taxCategory ?? "GENERAL",
              unitPriceCents: l.unitPriceCents,
              quantity: l.quantity,
            };
          }),
          customer,
          paymentStatus,
          paymentRows,
          discountPercent: discountValue,
          note,
          sellerName: snapshot.sellerName,
          rate: snapshot.rate,
          currencyCode: snapshot.currencyCode,
          exchangeRateEnabled: snapshot.exchangeRateEnabled,
          referenceCurrency: snapshot.referenceCurrency,
          ivaGeneralRatePercent: snapshot.ivaGeneralRatePercent,
          ivaReducedRatePercent: snapshot.ivaReducedRatePercent,
        })
      );
      setStep("receipt");
    });
  }

  function newSale() {
    setCustomer(null);
    resetCart();
    setPaymentStatus("PAID");
    setPaymentRows(defaultPaymentSplitRows(0, snapshot.rate, snapshot.exchangeRateEnabled));
    setNote("");
    setDiscountPercent("0");
    setCompletedSale(null);
    setStep("customer");
  }

  const freshnessNote = (
    <p className="text-xs text-muted-foreground text-center">
      Sin conexión — catálogo guardado {timeAgoLabel(snapshot.savedAt)}. Las cantidades pueden no
      reflejar ventas hechas en otras cajas mientras estuviste desconectado.
    </p>
  );

  if (step === "receipt" && completedSale) {
    return (
      <div className="flex flex-col gap-3 p-6">
        {freshnessNote}
        <ReceiptView
          sale={completedSale}
          rate={snapshot.rate}
          currencyCode={snapshot.currencyCode}
          exchangeRateEnabled={snapshot.exchangeRateEnabled}
          referenceCurrency={snapshot.referenceCurrency}
          printPaperSize={snapshot.printPaperSize}
          company={snapshot.company}
          onNewSale={newSale}
          pendingSync
        />
      </div>
    );
  }

  if (step === "customer") {
    return (
      <div className="flex flex-col gap-3 p-6">
        {freshnessNote}
        <CustomerForm onContinue={continueFromCustomer} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-56px)] p-6">
      <OfflineSyncBanner />
      {freshnessNote}
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <div className="text-sm">
          <span className="text-muted-foreground">Cliente: </span>
          <span className="font-medium">
            {customer?.firstName} {customer?.lastName}
          </span>
          <span className="text-muted-foreground"> · {customer?.phone}</span>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setStep("customer")}>
          Editar cliente
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 flex-1 min-h-0">
        <ProductPicker
          products={snapshot.products}
          rate={snapshot.rate}
          currencyCode={snapshot.currencyCode}
          exchangeRateEnabled={snapshot.exchangeRateEnabled}
          referenceCurrency={snapshot.referenceCurrency}
          categories={snapshot.categories}
          onAdd={addProduct}
        />
        <Cart
          lines={lines.map((l) => {
            const current = productById.get(l.productId);
            return { ...l, maxStock: current ? maxStockFor(current) : l.maxStock, product: current ?? l.product };
          })}
          rate={snapshot.rate}
          currencyCode={snapshot.currencyCode}
          exchangeRateEnabled={snapshot.exchangeRateEnabled}
          referenceCurrency={snapshot.referenceCurrency}
          paymentStatus={paymentStatus}
          onPaymentStatusChange={setPaymentStatus}
          paymentRows={paymentRows}
          onPaymentRowsChange={setPaymentRows}
          onIncrement={increment}
          onDecrement={decrement}
          onSetQuantity={setQuantity}
          onSetPriceTier={setPriceTier}
          onRemove={remove}
          note={note}
          onNoteChange={setNote}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          onCheckout={checkout}
          isPending={isPending}
          error={null}
        />
      </div>
    </div>
  );
}

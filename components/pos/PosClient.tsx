"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PlusIcon, SearchIcon, UserIcon, UsersIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PaymentStatus } from "@prisma/client";
import type { ListedProduct } from "@/lib/product-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Chip } from "@/components/ui/chip";
import { searchCustomers } from "@/lib/actions/customers";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart, type CartLine } from "@/components/pos/Cart";
import { PayScreen, type DocumentKind, type PayConfirm } from "@/components/pos/PayScreen";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { useDefaultPaymentRow } from "@/components/payments/useDefaultPaymentRow";
import { completeSale, getSaleReceipt } from "@/lib/actions/sales";
import { SALE_CHANNEL_LABELS } from "@/lib/format";
import type { QuoteForConversion } from "@/lib/actions/quotes";
import { computeItemDiscountCents } from "@/lib/discount";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { queueSale, type PendingSaleInput } from "@/lib/offline/sync";
import { useCatalogSync } from "@/lib/offline/use-catalog-sync";
import { buildPendingReceipt } from "@/lib/offline/pending-receipt";
import { useCart } from "@/lib/pos/use-cart";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";
import type { PaymentMethod, PrintPaperSize, ReferenceCurrency, SaleChannel } from "@prisma/client";

type SaleWithItems = NonNullable<Awaited<ReturnType<typeof getSaleReceipt>>>;
type Step = "customer" | "cart" | "pay" | "receipt";

function PosSession({
  paymentAccounts = [],
  requireCustomer = false,
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  igtfRatePercent = null,
  printPaperSize,
  categories,
  company,
  sellerName,
  initialQuote,
  accountTabs,
  onHold,
  topMethod = null,
  companyId,
  companyName,
  branchId,
  branchName,
  ivaGeneralRatePercent,
  ivaReducedRatePercent,
}: {
  paymentAccounts?: PaymentAccountRow[];
  requireCustomer?: boolean;
  products: ListedProduct[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  // Set only for IGTF agents (see lib/igtf.ts).
  igtfRatePercent?: number | null;
  printPaperSize: PrintPaperSize;
  categories: string[];
  company: DeliveryNoteCompany;
  sellerName: string;
  // Prefills customer + cart from an existing Quote (see the "Facturar"
  // button in QuoteHistoryTable and ?fromQuote= in app/pos/page.tsx) —
  // resolved server-side against CURRENT product prices/stock, not the
  // quote's frozen snapshot. Lines whose product no longer exists in
  // `products` (deleted/deactivated since the quote was made) are silently
  // dropped here too, as a second line of defense on top of the filtering
  // already done in getQuoteForConversion.
  initialQuote?: QuoteForConversion | null;
  // Pestañas de cuentas (las pone PosClient dentro de la tarjeta de venta).
  accountTabs?: React.ReactNode;
  // Deja esta cuenta en espera y abre otra (la pone PosClient).
  onHold?: () => void;
  // Método de pago más usado hoy, para marcarlo en la pantalla de cobro.
  topMethod?: PaymentMethod | null;
  companyId: string;
  // Only used to keep this terminal's offline catalog snapshot up to date
  // (see useCatalogSync below) — nothing here changes this component's own
  // online behavior.
  companyName: string;
  branchId: string | null;
  branchName: string | null;
  ivaGeneralRatePercent: number;
  ivaReducedRatePercent: number;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  // Keeps this terminal's product list (stock/prices) in sync with sales and
  // catalog edits made from any other open terminal for the same business.
  useLiveRefresh(`pos:${companyId}`, "product");
  useLiveRefresh(`pos:${companyId}`, "sale");
  // Keeps IndexedDB's offline catalog snapshot warm for this branch — see
  // components/pos/PosOfflineClient.tsx, the screen that reads it back when
  // this same page can't be reached at all (no network at navigation time).
  useCatalogSync({
    branchId,
    branchName,
    companyId,
    companyName,
    sellerName,
    products,
    categories,
    rate,
    currencyCode,
    exchangeRateEnabled,
    referenceCurrency,
    printPaperSize,
    ivaGeneralRatePercent,
    ivaReducedRatePercent,
    company,
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const initialLines: CartLine[] = (initialQuote?.lines ?? [])
    .map((l): CartLine | null => {
      const product = productById.get(l.productId);
      if (!product) return null;
      return {
        productId: product.id,
        name: product.name,
        unitPriceCents: l.unitPriceCents,
        quantity: l.quantity,
        maxStock: product.trackStock ? product.stock : Infinity,
        product,
        priceTierOverride: null,
      };
    })
    .filter((l): l is CartLine => l != null);
  // Como en la preview: se entra directo al catálogo y el cliente se pide al cobrar
// (registrar uno, elegirlo en el Directorio o «Cliente general» solo desde el Directorio).
const [step, setStep] = useState<Step>("cart");
  const containerRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<null | "register" | "directory">(null);
  const [fromPay, setFromPay] = useState(false);
  const [dirQuery, setDirQuery] = useState("");
  const [dirResults, setDirResults] = useState<{ id: string; firstName: string; lastName: string; phone: string; address: string | null; rif: string | null }[]>([]);
  const [customer, setCustomer] = useState<CustomerInfo | null>(
    initialQuote
      ? {
          firstName: initialQuote.customerFirstName,
          lastName: initialQuote.customerLastName,
          phone: initialQuote.customerPhone,
          address: initialQuote.customerAddress,
          rif: "",
        }
      : null
  );
  const {
    lines,
    maxStockFor,
    addProduct: addProductToCart,
    increment,
    decrement,
    setQuantity,
    setPriceTier,
    remove,
    reset: resetCart,
  } = useCart(initialLines);
  const [quoteId] = useState<string | null>(initialQuote?.quoteId ?? null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PAID");
  const [paymentRows, setPaymentRows] = useState<PaymentSplitRow[]>(() =>
    defaultPaymentSplitRows(0, rate, exchangeRateEnabled)
  );
  const [note, setNote] = useState("");
  const [documentKind, setDocumentKind] = useState<DocumentKind>("delivery");
  // Vuelto entregado en efectivo (lo muestra «Venta registrada»).
  const [change, setChange] = useState<string | null>(null);
  const [channel, setChannel] = useState<SaleChannel>("MOSTRADOR");
  const [discountPercent, setDiscountPercentRaw] = useState("0");
  // Cupón canjeado en la pantalla de cobro (código y teléfono del cliente para el que se validó).
  const [coupon, setCoupon] = useState<{ code: string; phone: string } | null>(null);
  // Cambiar el descuento a mano quita el cupón (el servidor exige que el porcentaje coincida con el del cupón).
  const setDiscountPercent = (v: string) => {
    setCoupon(null);
    setDiscountPercentRaw(v);
  };
  const activeCoupon = coupon && customer?.phone === coupon.phone ? coupon : null;
  const [error, setError] = useState<string | null>(null);
  // Either a real, server-confirmed sale, or a locally-built stand-in for one
  // queued while offline (see queueOfflineSale below) — both render fine in
  // ReceiptView since they share the same shape.
  const [completedSale, setCompletedSale] = useState<SaleWithItems | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [isPending, startTransition] = useTransition();

  const rawTotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const discountValue = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  // Same per-line rounding completeSale applies server-side, so the payment
  // split this drives always matches the total that's actually validated at
  // checkout (see assertPaymentsMatchTotal in lib/payment-currency.ts).
  const discountCentsTotal = lines.reduce(
    (sum, l) => sum + computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
    0
  );
  const total = rawTotal - discountCentsTotal;
  // A 100%-discounted sale has nothing to collect — see Cart's isExonerated
  // and checkout()/buildReceiptPreview below, which both use this to force
  // paymentStatus to PAID with no payment rows instead of whatever the
  // cashier had selected before applying the exoneration.
  const exonerated = total <= 0;

  // Keep the single default payment row in sync with the cart total as
  // products are added/removed, so the common single-method case never
  // requires the user to manually retype the amount. Once a second row is
  // added (an intentional split), amounts are fully user-controlled.
  useDefaultPaymentRow(total, rate, exchangeRateEnabled, setPaymentRows);

  // «Volver a vender» (lista de ventas): suma los artículos de una venta anterior a la cuenta visible.
  useEffect(() => {
    function onResell(e: Event) {
      if (!containerRef.current || containerRef.current.offsetParent === null) return;
      const items = (e as CustomEvent<{ productId: string; quantity: number }[]>).detail;
      for (const it of items) {
        const product = productById.get(it.productId);
        if (!product) continue;
        for (let i = 0; i < it.quantity; i++) addProductToCart(product);
      }
    }
    window.addEventListener("kr-pos-resell", onResell);
    return () => window.removeEventListener("kr-pos-resell", onResell);
  });

  function addProduct(product: ListedProduct) {
    setError(null);
    addProductToCart(product);
  }

  function continueFromCustomer(info: CustomerInfo) {
    setCustomer(info);
    // Si venía de «Cobrar», sigue directo a la pantalla de cobro.
    setStep(fromPay && lines.length > 0 ? "pay" : "cart");
    setDialog(null);
    setFromPay(false);
  }

  function useGeneralCustomer() {
    continueFromCustomer({ firstName: "Cliente", lastName: "general", phone: "0000-0000000", address: "Venta sin datos", rif: "" });
  }

  function runDirectorySearch(q: string) {
    setDirQuery(q);
    if (q.trim().length < 2) {
      setDirResults([]);
      return;
    }
    searchCustomers(q)
      .then((r) => setDirResults(r.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address, rif: c.rif }))))
      .catch(() => setDirResults([]));
  }

  // Sin cliente no se cobra: se abre «Registrar cliente» con el atajo al Directorio.
  function requestCheckout() {
    if (!customer) {
      setFromPay(true);
      setDialog("register");
      return;
    }
    setError(null);
    setStep("pay");
  }

  // Builds a stand-in Sale (matching what ReceiptView expects) from data
  // already on the client, for a sale that was queued offline and has no
  // real database row yet — control numbers are null until it actually
  // syncs. Shared with components/pos/PosOfflineClient.tsx (see
  // lib/offline/pending-receipt.ts) so both compute the exact same real IVA
  // breakdown from the cached rates, not a placeholder.
  function buildReceiptPreview(customer: CustomerInfo, status: PaymentStatus, rows: PaymentSplitRow[]): SaleWithItems {
    return buildPendingReceipt({
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
      paymentStatus: exonerated ? "PAID" : status,
      paymentRows: exonerated ? [] : rows,
      discountPercent: discountValue,
      note,
      sellerName,
      rate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      ivaGeneralRatePercent,
      ivaReducedRatePercent,
    });
  }

  function checkout({ paymentStatus: status, rows, extraNote, change: changeText }: PayConfirm) {
    if (!customer) return;
    setPaymentStatus(status);
    setPaymentRows(rows);
    setChange(changeText);
    const finalNote = [extraNote, activeCoupon ? `Cupón ${activeCoupon.code} (${discountValue} %)` : "", note.trim()].filter(Boolean).join(" · ");
    setError(null);
    // One key per checkout, sent on the online attempt AND kept in the
    // offline queue: if the server saved the sale but the response never
    // arrived, the queued retry resolves to that same sale instead of
    // creating (and charging, and discounting stock for) a second one.
    const saleInput: PendingSaleInput = {
      idempotencyKey: crypto.randomUUID(),
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        priceTier: l.priceTierOverride ?? undefined,
      })),
      paymentStatus: exonerated ? "PAID" : status,
      channel,
      payments:
        !exonerated && status === "PAID"
          ? rows.map((r) => ({
              paymentMethod: r.paymentMethod,
              amount: r.amount,
              paidInForeignCurrency: r.paidInForeignCurrency,
              reference: r.reference,
            }))
          : [],
      discountPercent: discountValue,
      promoCode: activeCoupon?.code,
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      customerRif: customer.rif || undefined,
      note: finalNote || undefined,
      quoteId: quoteId ?? undefined,
    };

    async function queueOfflineSale(customerInfo: CustomerInfo) {
      await queueSale({ ...saleInput, offlineExchangeRate: rate ?? undefined }, {
        totalCents: total,
        items: lines.map((l) => ({
          productName: productById.get(l.productId)?.name ?? l.name,
          category: productById.get(l.productId)?.category ?? null,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          subtotalCents: l.unitPriceCents * l.quantity - computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
        })),
        sellerName,
        note: finalNote || null,
      });
      setCompletedSale(buildReceiptPreview(customerInfo, status, rows));
      setPendingSync(true);
      setStep("receipt");
    }

    startTransition(async () => {
      if (!online) {
        await queueOfflineSale(customer);
        return;
      }
      let result: Awaited<ReturnType<typeof completeSale>>;
      try {
        result = await completeSale(saleInput);
      } catch {
        // A network-shaped failure mid-submit — queue it rather than risk
        // losing the sale. The idempotency key above makes the later sync
        // return the same sale if the server had actually saved it.
        await queueOfflineSale(customer);
        return;
      }
      if (!result.success) {
        setError(result.error);
        return;
      }
      // The sale IS saved from here on: a failure loading the receipt must
      // never send it to the offline queue again.
      try {
        const sale = await getSaleReceipt(result.saleId);
        if (sale) setCompletedSale(sale);
        setPendingSync(false);
        setStep("receipt");
        // Plain refresh() would re-render this route with whatever query
        // string is still in the address bar — for a sale completed via
        // ?fromQuote=<id>, that would re-run getQuoteForConversion and show
        // its "ya fue facturado" error on top of the receipt that just
        // succeeded. replace() drops the query string too, so the receipt
        // is the only thing on screen.
        router.replace("/pos");
      } catch {
        setCompletedSale(buildReceiptPreview(customer, status, rows));
        setPendingSync(false);
        setStep("receipt");
      }
    });
  }

  function newSale() {
    setCustomer(null);
    resetCart();
    setPaymentStatus("PAID");
    setPaymentRows(defaultPaymentSplitRows(0, rate, exchangeRateEnabled));
    setNote("");
    setDiscountPercent("0");
    setCoupon(null);
    setCompletedSale(null);
    setPendingSync(false);
    setChange(null);
    setDocumentKind("delivery");
    setStep("cart");
  }

  const isGeneral = customer?.phone === "0000-0000000";
  const itemCount = lines.reduce((n, l) => n + l.quantity, 0);

  // Atajos de la preview en la venta: «C» cobra y «E» deja la venta en espera.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (step !== "cart" || dialog || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!containerRef.current || containerRef.current.offsetParent === null) return;
      if (lines.length === 0) return;
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        requestCheckout();
      } else if ((e.key === "e" || e.key === "E") && onHold) {
        e.preventDefault();
        onHold();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function openDirectory(fromPayStep = false) {
    setFromPay(fromPayStep);
    setDirQuery("");
    setDirResults([]);
    setDialog("directory");
  }

  // Color del canal elegido, como en la preview.
  const channelTone: Record<SaleChannel, string | undefined> = {
    MOSTRADOR: undefined,
    DELIVERY: "border-success bg-success/14 text-success",
    PICKUP: "border-(--m-inv) bg-warning/18 text-warning",
    ONLINE: "border-(--m-mkt) bg-(--m-mkt)/12 text-(--m-mkt)",
  };

  let body: React.ReactNode;
  if (step === "receipt" && completedSale) {
    body = (
      <div className="min-h-0 flex-1 md:overflow-y-auto">
        <ReceiptView
          sale={completedSale}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          printPaperSize={printPaperSize}
          company={company}
          onNewSale={newSale}
          pendingSync={pendingSync}
          documentKind={documentKind}
          change={change}
        />
      </div>
    );
  } else if (step === "pay" && customer) {
    body = (
      <div className="min-h-0 flex-1 md:overflow-y-auto">
        <PayScreen
          customerName={`${customer.firstName} ${customer.lastName}`}
          customerPhone={customer.phone}
          rawTotal={rawTotal}
          total={total}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          couponCode={activeCoupon?.code ?? null}
          onCouponApplied={(code, percent) => {
            setCoupon({ code, phone: customer.phone });
            setDiscountPercentRaw(String(percent));
          }}
          onCouponRemoved={() => setDiscountPercent("0")}
          paymentAccounts={paymentAccounts}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          igtfRatePercent={igtfRatePercent}
          isGeneralCustomer={isGeneral}
          topMethod={topMethod}
          isPending={isPending}
          error={error}
          onBack={() => setStep("cart")}
          onPickCustomer={() => openDirectory(true)}
          documentKind={documentKind}
          onDocumentKindChange={setDocumentKind}
          onConfirm={checkout}
        />
      </div>
    );
  } else {
    const saleHeader = (
      <>
        <div className="flex items-start justify-between gap-2.5">
          <div>
            <b className="text-xl font-bold tracking-[-0.02em]">Venta actual</b>
            <div className="text-[13px] text-muted-foreground">
              {itemCount} {itemCount === 1 ? "producto" : "productos"} · {SALE_CHANNEL_LABELS[channel]}
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => resetCart()}>
            Vaciar
          </Button>
        </div>
        <div role="radiogroup" aria-label="Canal de venta" className="my-2 flex flex-wrap gap-2">
          {(Object.keys(SALE_CHANNEL_LABELS) as SaleChannel[]).map((ch) => (
            <Chip
              key={ch}
              role="radio"
              aria-checked={channel === ch}
              active={channel === ch}
              onClick={() => setChannel(ch)}
              className={channel === ch ? channelTone[ch] : undefined}
            >
              {SALE_CHANNEL_LABELS[ch]}
            </Chip>
          ))}
        </div>
        <div className="mb-2">{accountTabs}</div>
        <div className="mt-1 mb-1.5 grid grid-cols-[1.2fr_1fr] gap-2">
          <Button
            type="button"
            className="min-h-[46px] justify-center"
            onClick={() => {
              setFromPay(false);
              setDialog("register");
            }}
          >
            <PlusIcon strokeWidth={2.6} /> Registrar cliente
          </Button>
          <Button type="button" variant="outline" className="min-h-[46px] justify-center" onClick={() => openDirectory(false)}>
            <UsersIcon strokeWidth={2.2} /> Directorio
          </Button>
        </div>
        {customer && (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-muted px-3 py-2.5">
            <span className="grid size-11 flex-none place-items-center rounded-[14px] bg-primary/12 text-primary">
              <UserIcon className="size-[22px]" />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <small className="text-[0.8333em] text-muted-foreground">CLIENTE DE ESTA VENTA</small>
              <b className="block truncate font-bold">
                {customer.firstName} {customer.lastName}
              </b>
              <small className="block text-[0.8333em] text-muted-foreground">
                {isGeneral ? "Genérico · registra o elige uno para tu CRM" : customer.phone}
              </small>
            </span>
          </div>
        )}
      </>
    );
    body = (
      <div
        className={`grid grid-cols-1 items-start gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_360px] ${
          lines.length ? "pb-[calc(var(--tabbar-h)+5rem+env(safe-area-inset-bottom))] md:pb-0" : ""
        }`}
      >
        <ProductPicker
          products={products}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          categories={categories}
          onAdd={addProduct}
          quantities={Object.fromEntries(lines.map((l) => [l.productId, l.quantity]))}
        />
        <Cart
          bare
          top={saleHeader}
          lines={lines.map((l) => {
            const current = productById.get(l.productId);
            return {
              ...l,
              maxStock: current ? maxStockFor(current) : l.maxStock,
              product: current ?? l.product,
            };
          })}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          igtfRatePercent={igtfRatePercent}
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
          channel={channel}
          onChannelChange={setChannel}
          paymentAccounts={paymentAccounts}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          onCheckout={requestCheckout}
          onHold={onHold}
          isPending={isPending}
          error={error}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col gap-3">
      {body}

      <Dialog open={dialog === "register"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar cliente</DialogTitle>
            <DialogDescription>Se guarda en tu CRM y se usa en esta venta</DialogDescription>
          </DialogHeader>
          <CustomerForm
            bare
            initial={customer && !isGeneral ? customer : undefined}
            onContinue={continueFromCustomer}
            onCancel={() => setDialog(null)}
            submitLabel="Guardar y usar en la venta"
          />
          {fromPay && !requireCustomer && (
            <>
              <p className="mt-2.5 text-xs text-muted-foreground">¿Venta sin datos? Elige «Cliente general» en el Directorio.</p>
              <Button type="button" variant="outline" className="w-full" onClick={() => openDirectory(true)}>
                <UsersIcon strokeWidth={2.2} /> Abrir Directorio
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "directory"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Directorio de clientes</DialogTitle>
            <DialogDescription>
              {requireCustomer
                ? "Busca o registra al cliente: esta empresa exige nombre y teléfono en cada venta."
                : "Toca uno para usarlo en la venta"}
            </DialogDescription>
          </DialogHeader>
          <div className="relative my-2.5">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              type="search"
              aria-label="Buscar cliente"
              value={dirQuery}
              onChange={(e) => runDirectorySearch(e.target.value)}
              placeholder="Buscar por nombre o teléfono"
              className="min-h-[50px] w-full rounded-full border-[1.5px] border-border bg-card pr-[18px] pl-[46px] outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/30"
            />
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto">
            {dirResults.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  continueFromCustomer({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address ?? "", rif: c.rif ?? "" })
                }
                className="flex items-center gap-3 rounded-2xl bg-muted p-3 text-left transition-colors hover:bg-muted/70"
              >
                <span
                  className="grid size-11 flex-none place-items-center rounded-full text-base font-bold text-foreground"
                  style={{ background: `color-mix(in oklab, var(--chart-${(i % 5) + 1}) 22%, var(--card))` }}
                  aria-hidden
                >
                  {c.firstName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-bold">
                    {c.firstName} {c.lastName}
                  </b>
                  <small className="text-xs text-muted-foreground">{c.phone}</small>
                </span>
              </button>
            ))}
            {dirQuery.trim().length >= 2 && dirResults.length === 0 && (
              <p className="py-[18px] text-center text-muted-foreground">No hay clientes con ese nombre.</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setDialog("register")}>
              <PlusIcon strokeWidth={2.6} /> Registrar cliente
            </Button>
            {!requireCustomer && (
              <Button type="button" variant="outline" onClick={useGeneralCustomer}>
                Cliente general
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Varias cuentas abiertas a la vez (como en la preview): cada una es una venta
// independiente con su propio carrito, cliente y pagos. Las inactivas siguen
// montadas (ocultas) para no perder lo que llevan.
export function PosClient(props: React.ComponentProps<typeof PosSession>) {
  const [accounts, setAccounts] = useState<number[]>([1]);
  const [active, setActive] = useState(1);
  const [nextId, setNextId] = useState(2);

  function addAccount() {
    setAccounts((a) => [...a, nextId]);
    setActive(nextId);
    setNextId((n) => n + 1);
  }

  function closeAccount(id: number) {
    if (accounts.length === 1) return;
    if (!window.confirm("¿Cerrar esta cuenta? Se pierde lo que lleva sin cobrar.")) return;
    const left = accounts.filter((a) => a !== id);
    setAccounts(left);
    if (active === id) setActive(left[0]);
  }

  const tabs = (
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Cuentas abiertas">
        {accounts.map((id, i) => (
          <span key={id} className="inline-flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === id}
              onClick={() => setActive(id)}
              className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold transition-colors ${
                active === id ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              Cuenta {i + 1}
            </button>
            {accounts.length > 1 && (
              <button type="button" onClick={() => closeAccount(id)} aria-label={`Cerrar cuenta ${i + 1}`} className="ml-1 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          onClick={addAccount}
          className="min-h-[38px] rounded-xl border-2 border-dashed border-border px-3.5 text-[13px] font-bold text-foreground hover:bg-muted"
        >
          + Nueva cuenta
        </button>
      </div>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {accounts.map((id) => (
        <div key={id} className={id === active ? "min-h-0 flex-1" : "hidden"}>
          <PosSession {...props} initialQuote={id === 1 ? props.initialQuote : null} accountTabs={tabs} onHold={addAccount} />
        </div>
      ))}
    </div>
  );
}

import type { PaymentStatus, SaleItem, SalePayment, TaxCategory, ReferenceCurrency } from "@prisma/client";
import type { CustomerInfo } from "@/components/pos/CustomerForm";
import type { PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { resolveSalePayments } from "@/lib/payment-currency";
import { computeItemDiscountCents } from "@/lib/discount";
import { decomposeTax, rateForCategory } from "@/lib/tax";

// A cart line's-worth of the product info buildPendingReceipt actually
// needs — deliberately narrower than the full Prisma Product so both
// PosClient (which has one from `products`) and PosOfflineClient (which has
// one from its cached CatalogSnapshot) can build it the same way.
export type PendingReceiptLineInput = {
  productId: string;
  name: string;
  category: string | null;
  taxCategory: TaxCategory;
  unitPriceCents: number;
  quantity: number;
};

export type BuildPendingReceiptParams = {
  lines: PendingReceiptLineInput[];
  customer: CustomerInfo;
  paymentStatus: PaymentStatus;
  paymentRows: PaymentSplitRow[];
  // Already clamped to [0, 100] by the caller (see PosClient/PosOfflineClient's
  // own discountValue).
  discountPercent: number;
  note: string;
  sellerName: string;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  ivaGeneralRatePercent: number;
  ivaReducedRatePercent: number;
};

// Builds a stand-in Sale (matching what ReceiptView/PrintableSaleDocument
// expect) purely from data already on the client, for a sale that was queued
// offline and has no real database row yet — control numbers stay null until
// it actually syncs (see completeSale, lib/actions/sales.ts). Unlike the
// placeholder this replaced, the IVA breakdown shown here is the REAL one
// (same decomposeTax/rateForCategory the server itself uses), computed from
// the company's cached rates — only the control number and the exact rate
// AT THE MOMENT OF SYNC (if it moved since) can differ from what's finally
// persisted. resolveSalePayments is the same shared helper the server uses,
// so the currency breakdown shown here matches what will be persisted too.
export function buildPendingReceipt(params: BuildPendingReceiptParams) {
  const {
    lines,
    customer,
    paymentStatus,
    paymentRows,
    discountPercent,
    note,
    sellerName,
    rate,
    currencyCode,
    exchangeRateEnabled,
    referenceCurrency,
    ivaGeneralRatePercent,
    ivaReducedRatePercent,
  } = params;

  const now = new Date();
  const localId = crypto.randomUUID();

  const rawTotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const discountCentsTotal = lines.reduce(
    (sum, l) => sum + computeItemDiscountCents(l.unitPriceCents * l.quantity, discountPercent),
    0
  );
  const total = rawTotal - discountCentsTotal;

  const resolvedPayments =
    paymentStatus === "PAID"
      ? resolveSalePayments(
          paymentRows.map((r) => ({
            paymentMethod: r.paymentMethod,
            amount: Math.round(parseFloat(r.amount || "0") * 100),
            paidInForeignCurrency: r.paidInForeignCurrency,
            reference: r.reference || null,
          })),
          currencyCode,
          rate,
          exchangeRateEnabled,
          referenceCurrency
        )
      : [];

  const items: SaleItem[] = lines.map((l) => {
    const rawSubtotalCents = l.unitPriceCents * l.quantity;
    const itemDiscountCents = computeItemDiscountCents(rawSubtotalCents, discountPercent);
    const subtotalCents = rawSubtotalCents - itemDiscountCents;
    const taxRatePercent = rateForCategory(l.taxCategory, ivaGeneralRatePercent, ivaReducedRatePercent);
    const { baseCents, taxCents } = decomposeTax(subtotalCents, l.taxCategory, taxRatePercent);
    return {
      id: crypto.randomUUID(),
      saleId: localId,
      productId: l.productId,
      productName: l.name,
      category: l.category,
      unitPriceCents: l.unitPriceCents,
      quantity: l.quantity,
      subtotalCents,
      discountCents: itemDiscountCents,
      taxCategory: l.taxCategory,
      taxRatePercent,
      baseCents,
      taxCents,
    };
  });

  const payments: SalePayment[] = resolvedPayments.map((p) => ({
    id: crypto.randomUUID(),
    saleId: localId,
    paymentMethod: p.paymentMethod,
    amountEurCents: p.amountEurCents,
    currencyCode: p.currencyCode,
    amountCurrencyCents: p.amountCurrencyCents,
    paidInForeignCurrency: p.paidInForeignCurrency,
    reference: p.reference,
    // Prisma's Decimal type can't be constructed client-side without
    // importing the runtime class just for this optimistic preview object
    // (never persisted) — null is a valid value and nothing reads it here.
    exchangeRate: null,
    createdAt: now,
  }));

  return {
    id: localId,
    createdAt: now,
    totalCents: total,
    baseImponibleCents: items.reduce((sum, i) => sum + i.baseCents, 0),
    taxCents: items.reduce((sum, i) => sum + i.taxCents, 0),
    discountCents: discountCentsTotal,
    paymentMethod: payments[0]?.paymentMethod ?? null,
    note: note.trim() || null,
    exchangeRate: rate,
    paidInForeignCurrency: payments.some((p) => p.currencyCode !== currencyCode),
    customerFirstName: customer.firstName,
    customerLastName: customer.lastName,
    customerPhone: customer.phone,
    customerAddress: customer.address,
    customerRif: customer.rif || null,
    customerId: null,
    paymentReference: payments[0]?.reference ?? null,
    paymentStatus,
    paidAt: paymentStatus === "PAID" ? now : null,
    paidExchangeRate: null,
    controlNumber: null,
    receiptControlNumber: null,
    invoiceNumber: null,
    voided: false,
    voidedAt: null,
    companyId: "",
    sellerId: null,
    sellerName,
    items,
    payments,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

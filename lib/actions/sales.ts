"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { notifyLive, posChannel } from "@/lib/realtime";
import { SaleSchema, RegisterPaymentSchema } from "@/lib/validations";
import {
  resolveSalePayments,
  assertPaymentsMatchTotal,
  assertPaymentsWithinRemaining,
} from "@/lib/payment-currency";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currencies";
import { decomposeTax, rateForCategory } from "@/lib/tax";
import { computeItemDiscountCents } from "@/lib/discount";
import { resolveTierPrice, tierPriceCents } from "@/lib/pricing";
import type { ActionResult } from "@/lib/types";

export type CompleteSaleResult =
  | { success: true; saleId: string }
  | { success: false; error: string };

export async function completeSale(input: unknown): Promise<CompleteSaleResult> {
  const session = await requireSession();
  const { companyId, userId, sellerName } = session;
  if (!session.branchId) {
    return {
      success: false,
      error: 'Selecciona una sucursal antes de completar una venta — no se puede con "Todas las sucursales".',
    };
  }
  const branchId = session.branchId;
  const parsed = SaleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Carrito inválido" };
  }
  const {
    items,
    paymentStatus,
    payments,
    discountPercent,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerAddress,
    customerRif,
    note,
    quoteId,
  } = parsed.data;

  try {
    const saleId = await withTenant(companyId, async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          exchangeRate: true,
          localCurrencyCode: true,
          exchangeRateEnabled: true,
          referenceCurrency: true,
          ivaGeneralRatePercent: true,
          ivaReducedRatePercent: true,
        },
      });
      const exchangeRateEnabled = company?.exchangeRateEnabled ?? true;
      if (exchangeRateEnabled && company?.exchangeRate == null) {
        throw new Error("Configura la tasa de cambio antes de completar una venta.");
      }
      const exchangeRate = company?.exchangeRate ?? null;
      const rate = exchangeRate != null ? Number(exchangeRate) : null;
      const referenceCurrency = company?.referenceCurrency ?? "EUR";
      const ivaGeneralRatePercent = company?.ivaGeneralRatePercent ?? 16;
      const ivaReducedRatePercent = company?.ivaReducedRatePercent ?? 8;

      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, companyId, branchId },
      });
      const productById = new Map(products.map((p) => [p.id, p]));

      let totalCents = 0;
      let baseImponibleCents = 0;
      let taxTotalCents = 0;
      let discountTotalCents = 0;
      const itemsData = items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new Error("Uno de los productos ya no existe");
        }
        if (product.trackStock && product.stock < item.quantity) {
          throw new Error(
            `Stock insuficiente para "${product.name}" (disponible: ${product.stock})`
          );
        }
        // Price is always resolved server-side from the product's own
        // configured tiers — the client only ever picks WHICH tier
        // (item.priceTier), never an amount, so this can't be used to
        // tamper with what a sale actually charges. An override tier that
        // isn't actually configured on this product (or absent) falls back
        // to the quantity-based auto-detection.
        const autoTier = resolveTierPrice(product, item.quantity);
        const overridePriceCents = item.priceTier ? tierPriceCents(product, item.priceTier) : null;
        const unitPriceCents = overridePriceCents ?? autoTier.priceCents;
        // The discount is applied to each line's own subtotal BEFORE tax is
        // decomposed below — the fiscally correct order in Venezuela, since
        // it means the IVA on the factura is computed on the already-
        // discounted base, not just subtracted from an already-taxed total.
        const rawSubtotalCents = unitPriceCents * item.quantity;
        const itemDiscountCents = computeItemDiscountCents(rawSubtotalCents, discountPercent);
        const subtotalCents = rawSubtotalCents - itemDiscountCents;
        totalCents += subtotalCents;
        discountTotalCents += itemDiscountCents;
        const taxRatePercent = rateForCategory(product.taxCategory, ivaGeneralRatePercent, ivaReducedRatePercent);
        const { baseCents, taxCents } = decomposeTax(subtotalCents, product.taxCategory, taxRatePercent);
        baseImponibleCents += baseCents;
        taxTotalCents += taxCents;
        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          unitPriceCents,
          quantity: item.quantity,
          subtotalCents,
          discountCents: itemDiscountCents,
          taxCategory: product.taxCategory,
          taxRatePercent,
          baseCents,
          taxCents,
        };
      });

      const localCurrencyCode = company?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE;
      const isPaid = paymentStatus === "PAID";
      const resolvedPayments = isPaid
        ? resolveSalePayments(payments, localCurrencyCode, rate, exchangeRateEnabled, referenceCurrency)
        : [];
      if (isPaid) {
        assertPaymentsMatchTotal(resolvedPayments, totalCents, referenceCurrency);
      }

      const customer = await tx.customer.upsert({
        where: { companyId_phone: { companyId, phone: customerPhone } },
        create: {
          companyId,
          firstName: customerFirstName,
          lastName: customerLastName,
          phone: customerPhone,
          address: customerAddress,
          rif: customerRif ?? null,
        },
        update: {
          firstName: customerFirstName,
          lastName: customerLastName,
          address: customerAddress,
          // Only overwrite the saved RIF when this checkout actually
          // provided one — an existing customer's RIF shouldn't be wiped out
          // by a later sale that just didn't ask for it again.
          ...(customerRif ? { rif: customerRif } : {}),
        },
      });

      const previousCount = await tx.sale.count({ where: { branchId } });
      // The singular fields mirror the first payment split so any code that
      // only needs a quick summary (older reports, receipts) still has one —
      // the full breakdown lives in `payments`.
      const firstPayment = isPaid ? resolvedPayments[0] : undefined;

      const sale = await tx.sale.create({
        data: {
          totalCents,
          baseImponibleCents,
          taxCents: taxTotalCents,
          discountCents: discountTotalCents,
          paymentMethod: firstPayment?.paymentMethod ?? null,
          paymentStatus,
          paidAt: isPaid ? new Date() : null,
          // For credit sales, the customer hasn't decided currency yet — that's
          // captured later when payment is registered. Otherwise true if ANY
          // split line was paid in a currency other than the company's own.
          paidInForeignCurrency: isPaid
            ? resolvedPayments.some((p) => p.currencyCode !== localCurrencyCode)
            : false,
          paymentReference: firstPayment?.reference ?? null,
          customerFirstName,
          customerLastName,
          customerPhone,
          customerAddress,
          customerRif: customerRif ?? null,
          customerId: customer.id,
          companyId,
          branchId,
          exchangeRate,
          controlNumber: previousCount + 1,
          sellerId: userId,
          sellerName,
          note: note ?? null,
          items: { create: itemsData },
          payments: isPaid
            ? {
                create: resolvedPayments.map((p) => ({
                  paymentMethod: p.paymentMethod,
                  amountEurCents: p.amountEurCents,
                  currencyCode: p.currencyCode,
                  amountCurrencyCents: p.amountCurrencyCents,
                  paidInForeignCurrency: p.paidInForeignCurrency,
                  reference: p.reference,
                  exchangeRate,
                })),
              }
            : undefined,
        },
      });

      // Sum quantities per product first (a cart could list the same product
      // on more than one line) so each product gets exactly one parallel
      // update computed off its total decrement, rather than two updates
      // racing off the same stale productById snapshot.
      const quantityByProductId = new Map<string, number>();
      for (const item of itemsData) {
        quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) ?? 0) + item.quantity);
      }
      await Promise.all(
        Array.from(quantityByProductId, ([productId, quantity]) => {
          const product = productById.get(productId)!;
          if (!product.trackStock) return null;
          const newStock = product.stock - quantity;
          return tx.product.updateMany({
            where: { id: productId, companyId, branchId },
            data: { stock: newStock, ...(newStock === 0 ? { isActive: false } : {}) },
          });
        })
      );

      // Links this sale back to the quote it was "Facturar"-ed from (see
      // getQuoteForConversion in lib/actions/quotes.ts and the ?fromQuote=
      // prefill in app/pos/page.tsx) and flips the quote to CONVERTED in the
      // same transaction — Sale.quoteId is @unique, so trying to invoice the
      // same quote twice (e.g. two tabs open) throws here instead of
      // silently double-linking it.
      if (quoteId) {
        await tx.sale.update({ where: { id: sale.id }, data: { quoteId } });
        await tx.quote.updateMany({
          where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) },
          data: { status: "CONVERTED" },
        });
      }

      return sale.id;
    });

    revalidatePath("/inventory");
    revalidatePath("/pos");
    revalidatePath("/reports");
    revalidatePath("/customers");
    revalidatePath("/quotes/history");
    void notifyLive(posChannel(companyId), "sale");
    return { success: true, saleId };
  } catch (err) {
    const isDuplicateQuoteLink =
      err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002";
    const message = isDuplicateQuoteLink
      ? "Este presupuesto ya fue facturado"
      : err instanceof Error
        ? err.message
        : "No se pudo completar la venta";
    return { success: false, error: message };
  }
}

async function restoreStock(tx: Prisma.TransactionClient, saleId: string, companyId: string, branchId: string) {
  const items = await tx.saleItem.findMany({ where: { saleId } });
  const quantityByProductId = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) ?? 0) + item.quantity);
  }
  if (quantityByProductId.size === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: Array.from(quantityByProductId.keys()) }, companyId, branchId },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  await Promise.all(
    Array.from(quantityByProductId, ([productId, quantity]) => {
      const product = productById.get(productId);
      if (!product || !product.trackStock) return null;
      const newStock = product.stock + quantity;
      return tx.product.updateMany({
        where: { id: productId, companyId, branchId },
        data: { stock: newStock, ...(product.stock === 0 && newStock > 0 ? { isActive: true } : {}) },
      });
    })
  );
}

export async function voidSale(saleId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireSession();

  try {
    await withTenant(companyId, async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!sale) throw new Error("Venta no encontrada");
      if (sale.voided) throw new Error("La venta ya está anulada");

      await restoreStock(tx, saleId, companyId, sale.branchId);
      await tx.sale.update({ where: { id: saleId }, data: { voided: true, voidedAt: new Date() } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo anular la venta";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/reports");
  void notifyLive(posChannel(companyId), "sale");
  return { success: true };
}

export async function deleteSale(saleId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireSession();

  try {
    await withTenant(companyId, async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!sale) throw new Error("Venta no encontrada");

      if (!sale.voided) {
        await restoreStock(tx, saleId, companyId, sale.branchId);
      }
      await tx.sale.delete({ where: { id: saleId } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar la venta";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/reports");
  void notifyLive(posChannel(companyId), "sale");
  return { success: true };
}

// Registers an abono (partial or full) toward a CREDIT sale's outstanding
// balance. Each call adds one or more SalePayment rows (one per method in
// the split), stamped with today's date and exchange rate, without
// requiring the abono to cover the whole remaining balance — a sale can be
// collected across several of these over different days. The Sale itself
// only flips to PAID (and gets its receiptControlNumber, gating the Recibo
// de Pago document) once the sum of every abono actually reaches the total;
// until then it stays CREDIT with a smaller remaining balance.
export async function registerPayment(saleId: string, input: unknown): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireSession();
  const parsed = RegisterPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await withTenant(companyId, async (tx) => {
      const sale = await tx.sale.findFirst({
        where: {
          id: saleId,
          companyId,
          paymentStatus: "CREDIT",
          ...(sessionBranchId ? { branchId: sessionBranchId } : {}),
        },
        include: { payments: true },
      });
      if (!sale) throw new Error("Venta no encontrada o ya estaba pagada");

      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          exchangeRate: true,
          localCurrencyCode: true,
          exchangeRateEnabled: true,
          referenceCurrency: true,
        },
      });
      const rate = company?.exchangeRate != null ? Number(company.exchangeRate) : null;
      const localCurrencyCode = company?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE;
      const exchangeRateEnabled = company?.exchangeRateEnabled ?? true;
      const referenceCurrency = company?.referenceCurrency ?? "EUR";
      const resolvedPayments = resolveSalePayments(
        parsed.data.payments,
        localCurrencyCode,
        rate,
        exchangeRateEnabled,
        referenceCurrency
      );

      const alreadyPaidCents = sale.payments.reduce((sum, p) => sum + p.amountEurCents, 0);
      const remainingCents = sale.totalCents - alreadyPaidCents;
      const abonoCents = assertPaymentsWithinRemaining(resolvedPayments, remainingCents, referenceCurrency);

      const firstPayment = resolvedPayments[0];
      // Same rounding tolerance assertPaymentsWithinRemaining itself applies
      // (a mixed-currency split can be off by a cent or two per
      // locally-denominated line) — reused here to decide whether this
      // abono is the one that closes out the balance.
      const localLines = resolvedPayments.filter(
        (p) => p.currencyCode !== "USD" && p.currencyCode !== referenceCurrency
      ).length;
      const tolerance = localLines > 0 ? Math.max(1, localLines) : 0;
      const isFullySettled = remainingCents - abonoCents <= tolerance;

      await tx.salePayment.createMany({
        data: resolvedPayments.map((p) => ({
          saleId: sale.id,
          paymentMethod: p.paymentMethod,
          amountEurCents: p.amountEurCents,
          currencyCode: p.currencyCode,
          amountCurrencyCents: p.amountCurrencyCents,
          paidInForeignCurrency: p.paidInForeignCurrency,
          reference: p.reference,
          exchangeRate: company?.exchangeRate ?? null,
        })),
      });

      if (!isFullySettled) return;

      // Progressive, per-branch sequence for the "Recibo de pago" document —
      // independent of controlNumber (the Nota de entrega's own sequence),
      // assigned only now, the moment this credit sale's debt is fully
      // collected (possibly across several abonos).
      const previousReceiptCount = await tx.sale.count({
        where: { branchId: sale.branchId, receiptControlNumber: { not: null } },
      });

      await tx.sale.update({
        where: { id: saleId },
        data: {
          paymentStatus: "PAID",
          paidAt: new Date(),
          paymentMethod: firstPayment.paymentMethod,
          paymentReference: firstPayment.reference,
          paidInForeignCurrency: resolvedPayments.some((p) => p.currencyCode !== localCurrencyCode),
          // Snapshot of the rate in effect the day the balance was fully
          // settled, since a credit sale can be collected days (or several
          // abonos) after the original sale/rate snapshot.
          paidExchangeRate: company?.exchangeRate ?? null,
          receiptControlNumber: previousReceiptCount + 1,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo registrar el pago";
    return { success: false, error: message };
  }

  revalidatePath("/reports");
  return { success: true };
}

export async function getSaleReceipt(saleId: string) {
  const { companyId, branchId } = await requireSession();
  const sale = await withTenant(companyId, (tx) =>
    tx.sale.findFirst({
      where: { id: saleId, companyId, ...(branchId ? { branchId } : {}) },
      include: { items: true, payments: true },
    })
  );
  if (!sale) return null;
  // Client Components can't receive Prisma's Decimal instances across the
  // server action boundary — convert to a plain number first (including
  // each payment line's own rate snapshot, see SalePayment.exchangeRate).
  return {
    ...sale,
    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
    paidExchangeRate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
    payments: sale.payments.map((p) => ({
      ...p,
      exchangeRate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
    })),
  };
}

// `windows`, when given, restricts to sales created inside any of the given
// [start,end) ranges (see selectionToWindows, lib/report-types.ts) — used by
// Reportes' date filter. Omitted entirely for callers that want the plain
// "last N sales" behavior (e.g. Documentos, which does its own filtering).
export async function listRecentSales(limit = 10, windows?: { start: Date; end: Date }[]) {
  const { companyId, branchId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.sale.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(windows ? { OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { items: true, payments: true },
    })
  );
}

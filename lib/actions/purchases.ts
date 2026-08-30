"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, TaxCategory } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { BulkPurchaseRowSchema, PurchaseSchema } from "@/lib/validations";
import { decomposeTax, rateForCategory } from "@/lib/tax";
import { resolveSalePayments, assertPaymentsMatchTotal, toEurCents } from "@/lib/payment-currency";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currencies";
import type { ActionResult } from "@/lib/types";

export type CompletePurchaseResult =
  | { success: true; purchaseId: string }
  | { success: false; error: string };

// Receiving a purchase is the inverse of completeSale: it increases stock
// (instead of decrementing it) and updates Product.costCents to what was
// actually just paid for it — the shop's own cost basis should reflect the
// latest purchase, same way a real inventory system would.
export async function createPurchase(input: unknown): Promise<CompletePurchaseResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return {
      success: false,
      error: 'Selecciona una sucursal antes de registrar una compra — no se puede con "Todas las sucursales".',
    };
  }
  const branchId = session.branchId;
  const parsed = PurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const {
    supplierId,
    manualSupplierName,
    supplierInvoiceNo,
    items,
    invoiceAmount,
    invoiceAmountInForeignCurrency,
    paymentStatus,
    payments,
    note,
  } = parsed.data;

  try {
    const purchaseId = await withTenant(companyId, async (tx) => {
      // A manual supplier name skips this lookup entirely — see
      // Purchase.manualSupplierName's doc comment, it's never turned into a
      // real Supplier record.
      if (supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: supplierId, companyId } });
        if (!supplier) throw new Error("Proveedor no encontrado");
      }

      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          ivaGeneralRatePercent: true,
          ivaReducedRatePercent: true,
          isIvaWithholdingAgent: true,
          ivaWithholdingPercent: true,
          exchangeRate: true,
          localCurrencyCode: true,
          exchangeRateEnabled: true,
          referenceCurrency: true,
        },
      });
      const ivaGeneralRatePercent = company?.ivaGeneralRatePercent ?? 16;
      const ivaReducedRatePercent = company?.ivaReducedRatePercent ?? 8;
      const exchangeRateEnabled = company?.exchangeRateEnabled ?? true;
      if (paymentStatus === "PAID" && exchangeRateEnabled && company?.exchangeRate == null) {
        throw new Error("Configura la tasa de cambio antes de registrar una compra pagada.");
      }
      const exchangeRate = company?.exchangeRate ?? null;
      const rate = exchangeRate != null ? Number(exchangeRate) : null;
      const referenceCurrency = company?.referenceCurrency ?? "EUR";
      const localCurrencyCode = company?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE;

      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, companyId, branchId },
      });
      const productById = new Map(products.map((p) => [p.id, p]));

      // Each line's unit cost is the merchant's own per-product cost
      // *estimate*, entered in Bolívares or directly in the reference
      // currency (see PurchaseItemSchema.unitCostInForeignCurrency) — resolve
      // it to reference-currency cents now, using the exchange rate on file
      // at this exact moment (never a rate trusted from the client).
      let estimatedTotalCents = 0;
      let estimatedBaseCents = 0;
      let estimatedTaxCents = 0;
      const estimatedItems = items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new Error("Uno de los productos ya no existe en esta sucursal");
        }
        const unitCostCents = toEurCents(
          item.unitCost,
          item.unitCostInForeignCurrency ? referenceCurrency : localCurrencyCode,
          rate,
          referenceCurrency
        );
        const subtotalCents = unitCostCents * item.quantity;
        estimatedTotalCents += subtotalCents;
        const taxRatePercent = rateForCategory(item.taxCategory, ivaGeneralRatePercent, ivaReducedRatePercent);
        const { baseCents, taxCents } = decomposeTax(subtotalCents, item.taxCategory, taxRatePercent);
        estimatedBaseCents += baseCents;
        estimatedTaxCents += taxCents;
        return {
          productId: product.id,
          productName: product.name,
          taxCategory: item.taxCategory,
          taxRatePercent,
          quantity: item.quantity,
          unitCostCents,
          baseCents,
          taxCents,
          subtotalCents,
          affectsStock: item.affectsStock,
        };
      });

      // The real total on the supplier's paper invoice — entered manually,
      // it's the authoritative Purchase.totalCents, not the sum of the line
      // estimates above. Rescale every line's base/tax/cost proportionally
      // so the stored breakdown always adds up to exactly this real total
      // (a legally-issued invoice's own IVA breakdown always does), while
      // keeping the relative weight between lines/tax categories intact.
      const totalCents = toEurCents(
        invoiceAmount,
        invoiceAmountInForeignCurrency ? referenceCurrency : localCurrencyCode,
        rate,
        referenceCurrency
      );
      const scale = estimatedTotalCents > 0 ? totalCents / estimatedTotalCents : 1;
      const itemsData = estimatedItems.map((item) => ({
        ...item,
        unitCostCents: item.quantity > 0 ? Math.round((item.subtotalCents * scale) / item.quantity) : item.unitCostCents,
        subtotalCents: Math.round(item.subtotalCents * scale),
        baseCents: Math.round(item.baseCents * scale),
        taxCents: Math.round(item.taxCents * scale),
      }));
      let baseImponibleCents = itemsData.reduce((sum, item) => sum + item.baseCents, 0);
      // Absorb any rounding drift from the scaling above into the tax total
      // rather than the base — the stored total must equal exactly what was
      // typed in, and base + tax must equal that total.
      const taxTotalCents =
        estimatedTotalCents > 0 ? totalCents - baseImponibleCents : estimatedTaxCents;
      if (estimatedTotalCents === 0) baseImponibleCents = estimatedBaseCents;

      // "Contribuyente especial" companies withhold a percentage of the IVA
      // from the supplier and remit it to SENIAT directly instead — see
      // Company.isIvaWithholdingAgent.
      const ivaRetainedCents = company?.isIvaWithholdingAgent
        ? Math.round((taxTotalCents * (company.ivaWithholdingPercent ?? 75)) / 100)
        : 0;

      // What actually leaves the register: the full total, minus whatever
      // IVA was withheld and goes to SENIAT instead of the supplier (see
      // Purchase.ivaRetainedCents above) — the payment split must match
      // THIS, not totalCents.
      const isPaid = paymentStatus === "PAID";
      const amountOwedCents = totalCents - ivaRetainedCents;
      const resolvedPayments = isPaid
        ? resolveSalePayments(payments, localCurrencyCode, rate, exchangeRateEnabled, referenceCurrency)
        : [];
      if (isPaid) {
        assertPaymentsMatchTotal(resolvedPayments, amountOwedCents, referenceCurrency);
      }

      const previousCount = await tx.purchase.count({ where: { branchId } });

      const purchase = await tx.purchase.create({
        data: {
          companyId,
          branchId,
          supplierId: supplierId ?? null,
          manualSupplierName: manualSupplierName ?? null,
          supplierInvoiceNo: supplierInvoiceNo ?? null,
          controlNumber: previousCount + 1,
          totalCents,
          baseImponibleCents,
          taxCents: taxTotalCents,
          ivaRetainedCents,
          paymentStatus,
          paidAt: isPaid ? new Date() : null,
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

      // Sum quantities per product first (an invoice could list the same
      // product on more than one line) so each product gets exactly one
      // parallel update computed off its total received quantity, rather
      // than two updates racing off the same stale productById snapshot.
      // costCents keeps the last line's cost, matching the previous
      // sequential last-write-wins behavior.
      const stockUpdateByProductId = new Map<string, { quantity: number; unitCostCents: number }>();
      for (const item of itemsData) {
        if (!item.affectsStock) continue;
        const existing = stockUpdateByProductId.get(item.productId);
        stockUpdateByProductId.set(item.productId, {
          quantity: (existing?.quantity ?? 0) + item.quantity,
          unitCostCents: item.unitCostCents,
        });
      }
      await Promise.all(
        Array.from(stockUpdateByProductId, ([productId, { quantity, unitCostCents }]) => {
          const product = productById.get(productId)!;
          const newStock = product.stock + quantity;
          return tx.product.updateMany({
            where: { id: productId, companyId, branchId },
            data: {
              stock: newStock,
              costCents: unitCostCents,
              ...(product.stock === 0 && newStock > 0 ? { isActive: true } : {}),
            },
          });
        })
      );

      return purchase.id;
    });

    revalidatePath("/inventory");
    revalidatePath("/purchases");
    return { success: true, purchaseId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo registrar la compra";
    return { success: false, error: message };
  }
}

async function reverseStock(tx: Prisma.TransactionClient, purchaseId: string, companyId: string, branchId: string) {
  const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
  const quantityByProductId = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !item.affectsStock) continue;
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
      if (!product) return null;
      const newStock = Math.max(0, product.stock - quantity);
      return tx.product.updateMany({
        where: { id: productId, companyId, branchId },
        data: { stock: newStock },
      });
    })
  );
}

export async function markPurchasePaid(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireManager();
  const result = await withTenant(companyId, (tx) =>
    tx.purchase.updateMany({
      where: {
        id: purchaseId,
        companyId,
        paymentStatus: "PENDING",
        ...(sessionBranchId ? { branchId: sessionBranchId } : {}),
      },
      data: { paymentStatus: "PAID", paidAt: new Date() },
    })
  );
  if (result.count === 0) {
    return { success: false, error: "Compra no encontrada o ya estaba pagada" };
  }
  revalidatePath("/purchases");
  return { success: true };
}

export async function voidPurchase(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireManager();

  try {
    await withTenant(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!purchase) throw new Error("Compra no encontrada");
      if (purchase.voided) throw new Error("La compra ya está anulada");

      await reverseStock(tx, purchaseId, companyId, purchase.branchId);
      await tx.purchase.update({ where: { id: purchaseId }, data: { voided: true, voidedAt: new Date() } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo anular la compra";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  return { success: true };
}

export async function deletePurchase(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireManager();

  try {
    await withTenant(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!purchase) throw new Error("Compra no encontrada");

      if (!purchase.voided) {
        await reverseStock(tx, purchaseId, companyId, purchase.branchId);
      }
      await tx.purchase.delete({ where: { id: purchaseId } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar la compra";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  return { success: true };
}

export type BulkPurchaseRow = {
  supplierName: unknown;
  supplierInvoiceNo?: unknown;
  productSku?: unknown;
  productName?: unknown;
  quantity: unknown;
  unitCost: unknown;
  taxCategory?: unknown;
  paymentStatus?: unknown;
  affectsStock?: unknown;
  note?: unknown;
};

export type BulkPurchaseResult = {
  created: number;
  failed: { row: number; error: string }[];
};

// Each Excel row is one product line. Rows sharing the same supplier +
// invoice number are grouped into a single Purchase with several items —
// mirroring how one paper invoice usually lists several products — while a
// blank invoice number means that row becomes its own single-item purchase,
// since there's nothing to group it with. Reuses the same tax-decomposition
// and stock/cost-bump logic as createPurchase, just driven by rows parsed
// from a spreadsheet instead of a single form submission.
export async function bulkImportPurchases(rows: BulkPurchaseRow[]): Promise<BulkPurchaseResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return {
      created: 0,
      failed: [{ row: 0, error: 'Selecciona una sucursal antes de importar — no se puede con "Todas las sucursales".' }],
    };
  }
  const branchId = session.branchId;

  type ParsedRow = { row: number; data: import("@/lib/validations").BulkPurchaseRowInput };
  const parsedRows: ParsedRow[] = [];
  const failed: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = BulkPurchaseRowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      failed.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
      continue;
    }
    parsedRows.push({ row: i + 1, data: parsed.data });
  }

  const groups = new Map<string, ParsedRow[]>();
  for (const entry of parsedRows) {
    const key = entry.data.supplierInvoiceNo
      ? `${entry.data.supplierName.toLowerCase()}|${entry.data.supplierInvoiceNo.toLowerCase()}`
      : `__row__${entry.row}`;
    const arr = groups.get(key) ?? [];
    arr.push(entry);
    groups.set(key, arr);
  }

  let created = 0;

  await withTenant(companyId, async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: {
        ivaGeneralRatePercent: true,
        ivaReducedRatePercent: true,
        isIvaWithholdingAgent: true,
        ivaWithholdingPercent: true,
      },
    });
    const ivaGeneralRatePercent = company?.ivaGeneralRatePercent ?? 16;
    const ivaReducedRatePercent = company?.ivaReducedRatePercent ?? 8;

    for (const entries of groups.values()) {
      try {
        const supplierName = entries[0].data.supplierName;
        const supplier = await tx.supplier.findFirst({
          where: { companyId, name: { equals: supplierName, mode: "insensitive" } },
        });
        if (!supplier) throw new Error(`Proveedor "${supplierName}" no encontrado`);

        type ItemRow = {
          productId: string;
          productName: string;
          taxCategory: TaxCategory;
          taxRatePercent: number;
          unitCostCents: number;
          quantity: number;
          baseCents: number;
          taxCents: number;
          subtotalCents: number;
          affectsStock: boolean;
        };
        const itemsData: ItemRow[] = [];
        let totalCents = 0;
        let baseImponibleCents = 0;
        let taxTotalCents = 0;

        for (const entry of entries) {
          const { productSku, productName, quantity, unitCost, taxCategory, affectsStock } = entry.data;
          const product = productSku
            ? await tx.product.findFirst({ where: { branchId, sku: productSku } })
            : await tx.product.findFirst({
                where: { branchId, name: { equals: productName, mode: "insensitive" } },
              });
          if (!product) {
            throw new Error(`Producto "${productSku || productName}" no encontrado en esta sucursal`);
          }

          const resolvedTaxCategory = taxCategory ?? product.taxCategory;
          const subtotalCents = unitCost * quantity;
          totalCents += subtotalCents;
          const taxRatePercent = rateForCategory(resolvedTaxCategory, ivaGeneralRatePercent, ivaReducedRatePercent);
          const { baseCents, taxCents } = decomposeTax(subtotalCents, resolvedTaxCategory, taxRatePercent);
          baseImponibleCents += baseCents;
          taxTotalCents += taxCents;

          itemsData.push({
            productId: product.id,
            productName: product.name,
            taxCategory: resolvedTaxCategory,
            taxRatePercent,
            unitCostCents: unitCost,
            quantity,
            baseCents,
            taxCents,
            subtotalCents,
            affectsStock,
          });
        }

        const ivaRetainedCents = company?.isIvaWithholdingAgent
          ? Math.round((taxTotalCents * (company.ivaWithholdingPercent ?? 75)) / 100)
          : 0;

        const previousCount = await tx.purchase.count({ where: { branchId } });
        const paymentStatus = entries[0].data.paymentStatus ?? "PENDING";

        await tx.purchase.create({
          data: {
            companyId,
            branchId,
            supplierId: supplier.id,
            supplierInvoiceNo: entries[0].data.supplierInvoiceNo ?? null,
            controlNumber: previousCount + 1,
            totalCents,
            baseImponibleCents,
            taxCents: taxTotalCents,
            ivaRetainedCents,
            paymentStatus,
            paidAt: paymentStatus === "PAID" ? new Date() : null,
            note: entries[0].data.note ?? null,
            items: { create: itemsData },
          },
        });

        for (const item of itemsData) {
          if (!item.affectsStock) continue;
          const product = await tx.product.findFirst({ where: { id: item.productId, companyId, branchId } });
          if (!product) continue;
          const newStock = product.stock + item.quantity;
          await tx.product.updateMany({
            where: { id: item.productId, companyId, branchId },
            data: {
              stock: newStock,
              costCents: item.unitCostCents,
              ...(product.stock === 0 && newStock > 0 ? { isActive: true } : {}),
            },
          });
        }

        created++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo crear la compra";
        for (const entry of entries) {
          failed.push({ row: entry.row, error: message });
        }
      }
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  return { created, failed: failed.sort((a, b) => a.row - b.row) };
}

export async function listRecentPurchases(limit = 100) {
  const { companyId, branchId } = await requireManager();
  const purchases = await withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { items: true, supplier: true, payments: true },
    })
  );
  // Decimal can't cross the Server->Client Component boundary.
  return purchases.map((p) => ({
    ...p,
    payments: p.payments.map((pay) => ({
      ...pay,
      exchangeRate: pay.exchangeRate != null ? Number(pay.exchangeRate) : null,
    })),
  }));
}

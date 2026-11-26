"use server";

import { nextDocumentNumber } from "@/lib/document-sequence";
import { userErrorMessage } from "@/lib/user-error";
import { revalidatePath } from "next/cache";
import type { PaymentMethod, Prisma, TaxCategory } from "@prisma/client";
import { requirePurchasesAccess } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { BulkPurchaseRowSchema, PurchaseSchema } from "@/lib/validations";
import { decomposeTax, effectiveIvaRates, rateForCategory } from "@/lib/tax";
import { resolveSalePayments, assertPaymentsMatchTotal, toEurCents } from "@/lib/payment-currency";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currencies";
import type { ActionResult } from "@/lib/types";
import { recordStockMovement } from "@/lib/stock-movements";
import { invalidateProductsCache } from "@/lib/products-cache";
import { assertAccountFunds, toActionResult } from "@/lib/account-balance";
import { lineInAccountCurrency } from "@/lib/account-money";
import { paymentsPrimaryLocal } from "@/lib/money-primary";
import { addQty, lineTotalCents, subQty, toQty, validateQty } from "@/lib/units";
import { buildPurchasePaymentLine, stockShortfalls } from "@/lib/purchase-payment";
import { scaleLinesToTotal, scaleLooksWrong, baseUnitCost, resolveImportCurrency } from "@/lib/purchase-math";
import { paymentSettlesPurchase, purchaseRemaining } from "@/lib/purchase-payment";

export type CompletePurchaseResult =
  | { success: true; purchaseId: string }
  | Extract<ActionResult, { success: false }>;

// Receiving a purchase is the inverse of completeSale: it increases stock
// (instead of decrementing it) and updates Product.costCents to what was
// actually just paid for it — the shop's own cost basis should reflect the
// latest purchase, same way a real inventory system would.
export async function createPurchase(input: unknown): Promise<CompletePurchaseResult> {
  const session = await requirePurchasesAccess();
  const { companyId, userId: actorId, sellerName: actorName } = session;
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
          ivaEnabled: true,
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
      const { general: ivaGeneralRatePercent, reduced: ivaReducedRatePercent } = effectiveIvaRates(
        company?.ivaEnabled ?? true,
        company?.ivaGeneralRatePercent ?? 16,
        company?.ivaReducedRatePercent ?? 8
      );
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
        // El proveedor puede vender en otra presentación (caja de 12): cantidad y costo vienen por empaque
        // y se guardan en la unidad base del producto (12 unidades por caja).
        const packSize = item.packSize ?? 1;
        const qtyChk = validateQty(Math.round(item.quantity * packSize * 1000) / 1000, product.unit);
        if (!qtyChk.ok) throw new Error(`${product.name}: ${qtyChk.error}`);
        const baseQty = qtyChk.qty;
        const packCostCents = toEurCents(
          item.unitCost,
          item.unitCostInForeignCurrency ? referenceCurrency : localCurrencyCode,
          rate,
          referenceCurrency
        );
        const subtotalCents = lineTotalCents(packCostCents, item.quantity);
        const unitCostCents = Math.round(subtotalCents / baseQty);
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
          quantity: baseQty,
          unit: product.unit,
          unitLabel: product.unitLabel,
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
      if (estimatedTotalCents > 0 && scaleLooksWrong(scale)) {
        throw new Error(
          "El monto de la factura no coincide con los costos de las líneas (diferencia enorme). Revisa la moneda (Bs/divisa) y los montos."
        );
      }
      let itemsData: typeof estimatedItems;
      let baseImponibleCents: number;
      let taxTotalCents: number;
      if (estimatedTotalCents > 0) {
        // Tras el reescalado, el IVA por línea suma exactamente el IVA total (la última línea absorbe el redondeo).
        const r = scaleLinesToTotal(estimatedItems, scale, totalCents);
        itemsData = r.lines.map((l) => ({
          ...l,
          unitCostCents: l.quantity > 0 ? Math.round(l.subtotalCents / l.quantity) : l.unitCostCents,
        }));
        baseImponibleCents = r.baseTotalCents;
        taxTotalCents = r.taxTotalCents;
      } else {
        itemsData = estimatedItems;
        baseImponibleCents = estimatedBaseCents;
        taxTotalCents = estimatedTaxCents;
      }

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

      // Las cuentas de origen deben ser de esta empresa: se descartan ids ajenos o inactivos.
      const accountIds = [...new Set(resolvedPayments.map((p) => p.paymentAccountId).filter((x): x is string => !!x))];
      const validAccounts = accountIds.length
        ? new Set((await tx.paymentAccount.findMany({ where: { id: { in: accountIds }, companyId }, select: { id: true } })).map((a) => a.id))
        : new Set<string>();
      if (accountIds.some((id) => !validAccounts.has(id))) throw new Error("La cuenta elegida no existe. Recarga la página e inténtalo de nuevo.");
      // El saldo de cada cuenta debe cubrir lo que se paga desde ella.
      await assertAccountFunds(
        tx,
        companyId,
        resolvedPayments
          .filter((p) => !!p.paymentAccountId)
          .map((p) => ({
            accountId: p.paymentAccountId as string,
            debit: (cur: string, r: number | null) =>
              lineInAccountCurrency({ amountCurrencyCents: p.amountCurrencyCents, amountEurCents: p.amountEurCents, currencyCode: p.currencyCode, exchangeRate: exchangeRate }, cur, r),
          }))
      );

      if (supplierInvoiceNo) {
        const dup = await tx.purchase.findFirst({
          where: {
            companyId, voided: false,
            supplierInvoiceNo: { equals: supplierInvoiceNo, mode: "insensitive" },
            ...(supplierId ? { supplierId } : { supplierId: null, manualSupplierName: { equals: manualSupplierName ?? "", mode: "insensitive" } }),
          },
          select: { controlNumber: true },
        });
        if (dup) throw new Error(`Ya hay una compra registrada con la factura ${supplierInvoiceNo} de este proveedor${dup.controlNumber ? ` (compra N.º ${dup.controlNumber})` : ""}. Si es un error, anúlala primero.`);
      }

      const controlNumber = await nextDocumentNumber(tx, branchId, "purchase");

      const purchase = await tx.purchase.create({
        data: {
          companyId,
          branchId,
          supplierId: supplierId ?? null,
          manualSupplierName: manualSupplierName ?? null,
          supplierInvoiceNo: supplierInvoiceNo ?? null,
          controlNumber,
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
                  paymentAccountId: p.paymentAccountId ?? null,
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
          quantity: addQty(existing?.quantity ?? 0, item.quantity),
          unitCostCents: baseUnitCost(item.baseCents, item.quantity),
        });
      }
      await Promise.all(
        Array.from(stockUpdateByProductId, async ([productId, { quantity, unitCostCents }]) => {
          const product = productById.get(productId)!;
          const qtyText = quantity.toFixed(3);
          const rows = await tx.$queryRaw<{ stock: unknown }[]>`
            UPDATE "Product"
            SET "stock" = "stock" + ${qtyText}::numeric,
                "costCents" = CASE WHEN ${unitCostCents} > 0 THEN ${unitCostCents} ELSE "costCents" END,
                "isActive" = CASE WHEN "stock" = 0 AND "stock" + ${qtyText}::numeric > 0 THEN true ELSE "isActive" END
            WHERE "id" = ${productId} AND "companyId" = ${companyId} AND "branchId" = ${branchId}
            RETURNING "stock"
          `;
          if (!rows[0]) throw new Error("Uno de los productos ya no existe en esta sucursal");
          await recordStockMovement(tx, {
            companyId, branchId, productId, productName: product.name, actorId, actorName,
            reason: "PURCHASE", sourceType: "purchase", sourceId: purchase.id,
            quantityChange: quantity, stockBefore: subQty(toQty(rows[0].stock), quantity), stockAfter: toQty(rows[0].stock),
          });
        })
      );

      return purchase.id;
    });

    revalidatePath("/inventory");
    revalidatePath("/purchases");
    await invalidateProductsCache(companyId, branchId); // la compra sube existencias: el POS debe verlas ya
    return { success: true, purchaseId };
  } catch (err) {
    return toActionResult(err, "No se pudo registrar la compra");
  }
}

async function reverseStock(tx: Prisma.TransactionClient, purchaseId: string, companyId: string, branchId: string, actorId: string, actorName: string) {
  const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
  const quantityByProductId = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !item.affectsStock) continue;
    quantityByProductId.set(item.productId, addQty(quantityByProductId.get(item.productId) ?? 0, toQty(item.quantity)));
  }
  if (quantityByProductId.size === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: Array.from(quantityByProductId.keys()) }, companyId, branchId },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // Primero se bloquean las filas y se revisa que la mercancía de la compra siga en existencias: si ya se vendió
  // (stock menor a lo que entró) no se anula en silencio dejando el inventario en 0, se avisa qué falta.
  const locked = await tx.$queryRaw<{ id: string; stock: unknown }[]>`
    SELECT "id", "stock" FROM "Product"
    WHERE "id" = ANY(${Array.from(quantityByProductId.keys())}) AND "companyId" = ${companyId} AND "branchId" = ${branchId}
    FOR UPDATE
  `;
  const stockById = new Map(locked.map((r) => [r.id, toQty(r.stock)]));
  const short = stockShortfalls(
    Array.from(quantityByProductId, ([productId, quantity]) => ({
      name: productById.get(productId)?.name ?? "Producto",
      quantity,
      stock: stockById.get(productId) ?? null,
    }))
  );
  if (short.length) {
    throw new Error(
      `No se puede anular: parte de lo que entró con esta compra ya se vendió o salió (${short.join("; ")}). Ajusta el inventario o registra una devolución primero.`
    );
  }

  for (const [productId, quantity] of quantityByProductId) {
    const product = productById.get(productId);
    if (!product) continue;
    const qtyText = quantity.toFixed(3);
    const rows = await tx.$queryRaw<{ stock: unknown }[]>`
      UPDATE "Product" SET "stock" = "stock" - ${qtyText}::numeric
      WHERE "id" = ${productId} AND "companyId" = ${companyId} AND "branchId" = ${branchId}
      RETURNING "stock"
    `;
    if (!rows[0]) continue;
    await recordStockMovement(tx, {
      companyId, branchId, productId, productName: product.name, actorId, actorName,
      reason: "PURCHASE_VOID", sourceType: "purchase", sourceId: purchaseId,
      quantityChange: -quantity, stockBefore: addQty(toQty(rows[0].stock), quantity), stockAfter: toQty(rows[0].stock),
    });
  }
}

// Al anular, el costo de cada producto vuelve al de la última compra no anulada (costo base, sin IVA), siempre que la
// anulada fuera la más reciente de ese producto; si no queda ninguna otra compra, el costo vuelve a 0.
async function restorePreviousCost(tx: Prisma.TransactionClient, purchaseId: string, voidedCreatedAt: Date, companyId: string, branchId: string) {
  const items = await tx.purchaseItem.findMany({ where: { purchaseId, affectsStock: true, productId: { not: null } }, select: { productId: true } });
  for (const productId of new Set(items.map((i) => i.productId as string))) {
    const newer = await tx.purchaseItem.findFirst({
      where: { productId, affectsStock: true, purchase: { companyId, branchId, voided: false, createdAt: { gt: voidedCreatedAt } } },
      select: { id: true },
    });
    if (newer) continue;
    const prev = await tx.purchaseItem.findFirst({
      where: { productId, affectsStock: true, purchase: { companyId, branchId, voided: false } },
      orderBy: { purchase: { createdAt: "desc" } },
      select: { baseCents: true, quantity: true },
    });
    const cost = prev ? baseUnitCost(prev.baseCents, toQty(prev.quantity)) : 0;
    await tx.product.updateMany({ where: { id: productId, companyId, branchId }, data: { costCents: cost } });
  }
}

export async function voidPurchase(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId, userId: actorId, sellerName: actorName } = await requirePurchasesAccess();
  let purchaseBranchId: string | null = sessionBranchId;

  try {
    await withTenant(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!purchase) throw new Error("Compra no encontrada");
      if (purchase.voided) throw new Error("La compra ya está anulada");

      purchaseBranchId = purchase.branchId;
      // Se marca primero con condición (voided=false): dos clics simultáneos no revierten el stock dos veces.
      const claimed = await tx.purchase.updateMany({ where: { id: purchaseId, companyId, voided: false }, data: { voided: true, voidedAt: new Date() } });
      if (claimed.count === 0) throw new Error("La compra ya está anulada");
      // Sus pagos dejan de contar en el saldo de las cuentas (accountBalance excluye compras anuladas) y la compra sale de
      // las órdenes de pago (listPaymentOrders solo toma voided=false).
      await reverseStock(tx, purchaseId, companyId, purchase.branchId, actorId, actorName);
      await restorePreviousCost(tx, purchaseId, purchase.createdAt, companyId, purchase.branchId);
    });
  } catch (err) {
    const message = userErrorMessage(err, "No se pudo anular la compra");
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  revalidatePath("/purchases/orders");
  revalidatePath("/accounting/accounts");
  await invalidateProductsCache(companyId, purchaseBranchId);
  return { success: true };
}

// Fiscal documents are never physically deleted (audit KRPOS-DB-001/DB-002):
// deleting one lost a numbered document the SENIAT can ask for. Anular
// (voided) keeps it in the history and reverses its effect on stock. Kept
// as an action so an old client calling it gets a clear answer.
export async function deletePurchase(): Promise<ActionResult> {
  await requirePurchasesAccess();
  return {
    success: false,
    error: "Las compras no se eliminan porque son documentos fiscales. Usa Anular: queda en el historial y se revierte el stock.",
  };
}

export type BulkPurchaseRow = {
  supplierName: unknown;
  supplierInvoiceNo?: unknown;
  productSku?: unknown;
  productName?: unknown;
  quantity: unknown;
  unitCost: unknown;
  currency?: unknown;
  invoiceTotal?: unknown;
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
  const session = await requirePurchasesAccess();
  const { companyId, userId: actorId, sellerName: actorName } = session;
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

  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({
      where: { id: companyId },
      select: {
        ivaEnabled: true,
        ivaGeneralRatePercent: true,
        ivaReducedRatePercent: true,
        isIvaWithholdingAgent: true,
        ivaWithholdingPercent: true,
        exchangeRate: true,
        localCurrencyCode: true,
        referenceCurrency: true,
      },
    })
  );
  const importRate = company?.exchangeRate != null ? Number(company.exchangeRate) : null;
  const importReference = company?.referenceCurrency ?? "EUR";
  const importLocal = company?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE;
  {
    const { general: ivaGeneralRatePercent, reduced: ivaReducedRatePercent } = effectiveIvaRates(
      company?.ivaEnabled ?? true,
      company?.ivaGeneralRatePercent ?? 16,
      company?.ivaReducedRatePercent ?? 8
    );

    for (const entries of groups.values()) {
      try {
        // Una transacción por factura: un error en una no arrastra a las demás.
        await withTenant(companyId, async (tx) => {
        const supplierName = entries[0].data.supplierName;
        const suppliers = await tx.supplier.findMany({
          where: { companyId, name: { equals: supplierName, mode: "insensitive" } },
          take: 2,
        });
        if (suppliers.length === 0) throw new Error(`Proveedor "${supplierName}" no encontrado`);
        if (suppliers.length > 1) throw new Error(`Hay varios proveedores llamados "${supplierName}": déjalos con nombres distintos antes de importar`);
        const supplier = suppliers[0];
        const invoiceNo = entries[0].data.supplierInvoiceNo;
        if (invoiceNo) {
          const dup = await tx.purchase.findFirst({
            where: { companyId, supplierId: supplier.id, voided: false, supplierInvoiceNo: { equals: invoiceNo, mode: "insensitive" } },
            select: { id: true },
          });
          if (dup) throw new Error(`La factura ${invoiceNo} de "${supplierName}" ya está registrada`);
        }

        type ItemRow = {
          productId: string;
          productName: string;
          taxCategory: TaxCategory;
          taxRatePercent: number;
          unitCostCents: number;
          quantity: number;
          unit: string;
          unitLabel: string | null;
          baseCents: number;
          taxCents: number;
          subtotalCents: number;
          affectsStock: boolean;
        };
        const itemsData: ItemRow[] = [];
        let totalCents = 0;
        let baseImponibleCents = 0;
        let taxTotalCents = 0;

        // Todas las filas de una factura comparten la moneda: una mezcla se rechaza en vez de adivinar.
        const currencies = new Set(entries.map((e) => resolveImportCurrency(e.data.currency, importLocal, importReference)));
        if (currencies.size > 1) throw new Error("Las filas de una misma factura tienen monedas distintas");
        const rowCurrency = [...currencies][0];
        const invoiceTotals = new Set(entries.map((e) => e.data.invoiceTotal).filter((v): v is number => v != null));
        if (invoiceTotals.size > 1) throw new Error("Las filas de una misma factura tienen «Total factura» distintos");

        for (const entry of entries) {
          const { productSku, productName, quantity: packs, packSize, unitCost, taxCategory, affectsStock } = entry.data;
          const matches = productSku
            ? await tx.product.findMany({ where: { branchId, sku: productSku }, take: 2 })
            : await tx.product.findMany({ where: { branchId, name: { equals: productName, mode: "insensitive" } }, take: 2 });
          if (matches.length > 1) throw new Error(`Hay varios productos "${productSku || productName}": usa el SKU`);
          const product = matches[0];
          if (!product) {
            throw new Error(`Producto "${productSku || productName}" no encontrado en esta sucursal`);
          }

          const resolvedTaxCategory = taxCategory ?? product.taxCategory;
          // Misma conversión que createPurchase: el costo se declara en Bs o en divisa y se pasa a la moneda de referencia.
          const unitCostRef = toEurCents(unitCost, rowCurrency === "LOCAL" ? importLocal : importReference, importRate, importReference);
          const qtyChk = validateQty(Math.round(packs * (packSize ?? 1) * 1000) / 1000, product.unit);
          if (!qtyChk.ok) throw new Error(`${product.name}: ${qtyChk.error}`);
          const quantity = qtyChk.qty;
          const subtotalCents = lineTotalCents(unitCostRef, packs);
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
            unitCostCents: Math.round(subtotalCents / quantity),
            quantity,
            unit: product.unit,
            unitLabel: product.unitLabel,
            baseCents,
            taxCents,
            subtotalCents,
            affectsStock,
          });
        }

        // Con «Total factura» el desglose se reescala al total real (igual que createPurchase): costo e IVA por línea.
        const declaredTotal = [...invoiceTotals][0];
        if (declaredTotal != null && totalCents > 0) {
          const declaredRef = toEurCents(declaredTotal, rowCurrency === "LOCAL" ? importLocal : importReference, importRate, importReference);
          const scale = declaredRef / totalCents;
          if (scaleLooksWrong(scale)) {
            throw new Error("«Total factura» no coincide con los costos de las líneas (diferencia enorme). Revisa la moneda y los montos.");
          }
          const r = scaleLinesToTotal(itemsData, scale, declaredRef);
          itemsData.splice(0, itemsData.length, ...r.lines.map((l) => ({ ...l, unitCostCents: l.quantity > 0 ? Math.round(l.subtotalCents / l.quantity) : l.unitCostCents })));
          totalCents = declaredRef;
          baseImponibleCents = r.baseTotalCents;
          taxTotalCents = r.taxTotalCents;
        }

        const ivaRetainedCents = company?.isIvaWithholdingAgent
          ? Math.round((taxTotalCents * (company.ivaWithholdingPercent ?? 75)) / 100)
          : 0;

        const controlNumber = await nextDocumentNumber(tx, branchId, "purchase");
        // Una importación no trae pagos ni cuenta: siempre queda por pagar y se abona con registerPurchasePayment.
        const paymentStatus = "PENDING" as const;

        const purchase = await tx.purchase.create({
          data: {
            companyId,
            branchId,
            supplierId: supplier.id,
            supplierInvoiceNo: entries[0].data.supplierInvoiceNo ?? null,
            controlNumber,
            totalCents,
            baseImponibleCents,
            taxCents: taxTotalCents,
            ivaRetainedCents,
            paymentStatus,
            paidAt: null,
            note: entries[0].data.note ?? null,
            items: { create: itemsData },
          },
        });

        for (const item of itemsData) {
          if (!item.affectsStock) continue;
          const product = await tx.product.findFirst({ where: { id: item.productId, companyId, branchId } });
          if (!product) continue;
          const qtyText = item.quantity.toFixed(3);
          const stockRows = await tx.$queryRaw<{ stock: unknown }[]>`
            UPDATE "Product"
            SET "stock" = "stock" + ${qtyText}::numeric,
                "costCents" = CASE WHEN ${baseUnitCost(item.baseCents, item.quantity)} > 0 THEN ${baseUnitCost(item.baseCents, item.quantity)} ELSE "costCents" END,
                "isActive" = CASE WHEN "stock" = 0 AND "stock" + ${qtyText}::numeric > 0 THEN true ELSE "isActive" END
            WHERE "id" = ${product.id} AND "companyId" = ${companyId} AND "branchId" = ${branchId}
            RETURNING "stock"
          `;
          if (!stockRows[0]) continue;
          await recordStockMovement(tx, {
            companyId, branchId, productId: product.id, productName: product.name, actorId, actorName,
            reason: "IMPORT", sourceType: "purchase", sourceId: purchase.id,
            quantityChange: item.quantity, stockBefore: subQty(toQty(stockRows[0].stock), item.quantity), stockAfter: toQty(stockRows[0].stock),
          });
        }

        created++;
        });
      } catch (err) {
        const message = userErrorMessage(err, "No se pudo crear la compra");
        for (const entry of entries) {
          failed.push({ row: entry.row, error: message });
        }
      }
    }
  }

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  if (created > 0) await invalidateProductsCache(companyId, branchId);
  return { created, failed: failed.sort((a, b) => a.row - b.row) };
}

export async function listRecentPurchases(limit = 100, windows?: { start: Date; end: Date }[]) {
  const { companyId, branchId } = await requirePurchasesAccess();
  const purchases = await withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(windows ? { OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: true,
        supplier: true,
        branch: { select: { name: true } },
        payments: {
          orderBy: { createdAt: "asc" },
          include: { paymentAccount: { select: { kind: true, bankName: true, holder: true, accountNumber: true, currency: true } } },
        },
      },
    })
  );
  // Quién registró / anuló la compra: queda en los movimientos de stock que generó (solo si tuvo líneas con inventario).
  const moves = purchases.length
    ? await withTenant(companyId, (tx) =>
        tx.stockMovement.findMany({
          where: { companyId, sourceType: "purchase", sourceId: { in: purchases.map((p) => p.id) }, reason: { in: ["PURCHASE", "PURCHASE_VOID"] } },
          select: { sourceId: true, reason: true, actorName: true },
        })
      )
    : [];
  const actor = (id: string, reason: string) => moves.find((m) => m.sourceId === id && m.reason === reason)?.actorName ?? null;
  // Decimal can't cross the Server->Client Component boundary.
  return purchases.map((p) => ({
    ...p,
    branchName: p.branch.name,
    createdByName: actor(p.id, "PURCHASE"),
    voidedByName: actor(p.id, "PURCHASE_VOID"),
    payments: p.payments.map((pay) => ({
      ...pay,
      exchangeRate: pay.exchangeRate != null ? Number(pay.exchangeRate) : null,
    })),
  }));
}

export type PaymentOrderRow = {
  id: string;
  controlNumber: number | null;
  supplierName: string;
  createdAt: string;
  ageDays: number;
  totalCents: number;
  owedCents: number; // lo que se le debe al proveedor (total menos IVA retenido)
  paidCents: number;
  remainingCents: number;
  // Verdadero si lo ya abonado fue todo en bolívares: el saldo se ve primero en Bs.
  primaryLocal: boolean;
};

// Órdenes de pago: compras a crédito con saldo pendiente, de la más antigua a la más reciente.
export async function listPaymentOrders(): Promise<PaymentOrderRow[]> {
  const { companyId, branchId } = await requirePurchasesAccess();
  const rows = await withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}), voided: false, paymentStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 1000,
      include: { supplier: { select: { name: true } }, payments: { select: { amountEurCents: true, paymentMethod: true, paidInForeignCurrency: true } } },
    })
  );
  const co = await withTenant(companyId, (tx) =>
    tx.company.findUnique({ where: { id: companyId }, select: { exchangeRate: true, localCurrencyCode: true, exchangeRateEnabled: true, referenceCurrency: true } })
  );
  const ctx = {
    rate: co?.exchangeRate != null ? Number(co.exchangeRate) : null,
    localCurrencyCode: co?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE,
    referenceCurrency: co?.referenceCurrency ?? "EUR",
    exchangeRateEnabled: co?.exchangeRateEnabled ?? true,
  };
  const now = Date.now();
  return rows.map((p) => {
    const owed = p.totalCents - p.ivaRetainedCents;
    const paid = p.payments.reduce((n, x) => n + x.amountEurCents, 0);
    return {
      id: p.id,
      controlNumber: p.controlNumber,
      supplierName: p.supplier?.name ?? p.manualSupplierName ?? "Proveedor sin registrar",
      createdAt: p.createdAt.toISOString(),
      ageDays: Math.floor((now - p.createdAt.getTime()) / 86_400_000),
      totalCents: p.totalCents,
      owedCents: owed,
      paidCents: paid,
      remainingCents: Math.max(0, owed - paid),
      primaryLocal: paymentsPrimaryLocal(p.payments, ctx),
    };
  });
}

const PAY_METHODS = ["CASH", "CARD", "OTHER", "ZELLE", "BINANCE", "PAYPAL", "POS", "TRANSFER"] as const;

// Fraccionar pago: registra un abono a una compra. Cuando los abonos cubren lo que se le debe
// al proveedor, la compra pasa a pagada. El monto va en la moneda de referencia.
export async function registerPurchasePayment(
  purchaseId: string,
  method: string,
  amountCents: number,
  reference?: string,
  paymentAccountId?: string
): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requirePurchasesAccess();
  if (!(PAY_METHODS as readonly string[]).includes(method)) return { success: false, error: "Elige un método de pago" };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { success: false, error: "El monto debe ser mayor a 0" };
  try {
    await withTenant(companyId, async (tx) => {
      // Bloquea la compra: dos abonos simultáneos no pueden pasar con el mismo saldo.
      await tx.$queryRaw`SELECT "id" FROM "Purchase" WHERE "id" = ${purchaseId} AND "companyId" = ${companyId} FOR UPDATE`;
      const p = await tx.purchase.findFirst({
        where: { id: purchaseId, companyId, voided: false, paymentStatus: "PENDING", ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
        include: { payments: { select: { amountEurCents: true } } },
      });
      if (!p) throw new Error("Compra no encontrada o ya estaba pagada");
      const paid = p.payments.reduce((n, x) => n + x.amountEurCents, 0);
      const remaining = purchaseRemaining(p.totalCents, p.ivaRetainedCents, paid);
      if (amountCents > remaining) throw new Error("El abono es mayor al saldo pendiente");
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { exchangeRate: true, localCurrencyCode: true, exchangeRateEnabled: true, referenceCurrency: true },
      });
      const rate = company?.exchangeRate != null ? Number(company.exchangeRate) : null;
      // La moneda real del abono según el método (Bs para pago móvil/punto/transferencia/efectivo; divisa para Zelle…).
      const line = buildPurchasePaymentLine(method as PaymentMethod, amountCents, {
        rate,
        localCurrencyCode: company?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE,
        referenceCurrency: company?.referenceCurrency ?? "EUR",
        exchangeRateEnabled: company?.exchangeRateEnabled ?? true,
      });
      if (paymentAccountId) {
        const acc = await tx.paymentAccount.findFirst({ where: { id: paymentAccountId, companyId }, select: { id: true } });
        if (!acc) throw new Error("La cuenta elegida no existe. Recarga la página e inténtalo de nuevo.");
        await assertAccountFunds(tx, companyId, [
          {
            accountId: paymentAccountId,
            debit: (cur, r) =>
              lineInAccountCurrency({ amountCurrencyCents: line.amountCurrencyCents, amountEurCents: amountCents, currencyCode: line.currencyCode, exchangeRate: rate }, cur, r),
          },
        ]);
      }
      await tx.purchasePayment.create({
        data: {
          purchaseId: p.id,
          paymentMethod: method as (typeof PAY_METHODS)[number],
          amountEurCents: amountCents,
          currencyCode: line.currencyCode,
          amountCurrencyCents: line.amountCurrencyCents,
          paidInForeignCurrency: false,
          exchangeRate: rate,
          reference: reference?.trim().slice(0, 80) || null,
          paymentAccountId: paymentAccountId || null,
        },
      });
      if (paymentSettlesPurchase(amountCents, remaining)) {
        await tx.purchase.update({ where: { id: p.id }, data: { paymentStatus: "PAID", paidAt: new Date() } });
      }
    });
  } catch (err) {
    return toActionResult(err, "No se pudo registrar el pago");
  }
  revalidatePath("/purchases");
  revalidatePath("/purchases/orders");
  revalidatePath("/accounting/accounts");
  return { success: true };
}

export type CostOffer = { supplier: string; lastCostCents: number; date: string };
export type CostComparisonRow = { productName: string; offers: CostOffer[]; bestCostCents: number; savingPct: number };

// Comparativa de último costo: por producto, lo último que se pagó a cada proveedor. Solo productos
// comprados a 2 o más proveedores; el más barato va primero.
export async function costComparison(): Promise<CostComparisonRow[]> {
  const { companyId, branchId } = await requirePurchasesAccess();
  const items = await withTenant(companyId, (tx) =>
    tx.purchaseItem.findMany({
      where: { productId: { not: null }, purchase: { companyId, voided: false, ...(branchId ? { branchId } : {}) } },
      orderBy: { purchase: { createdAt: "desc" } },
      take: 3000,
      select: {
        productId: true, productName: true, unitCostCents: true,
        purchase: { select: { createdAt: true, manualSupplierName: true, supplier: { select: { name: true } } } },
      },
    })
  );
  const byProduct = new Map<string, { name: string; offers: Map<string, CostOffer> }>();
  for (const it of items) {
    const supplier = it.purchase.supplier?.name ?? it.purchase.manualSupplierName;
    if (!supplier || !it.productId) continue;
    const entry = byProduct.get(it.productId) ?? { name: it.productName, offers: new Map<string, CostOffer>() };
    // Las compras vienen de la más reciente a la más antigua: la primera por proveedor es la última.
    if (!entry.offers.has(supplier)) entry.offers.set(supplier, { supplier, lastCostCents: it.unitCostCents, date: it.purchase.createdAt.toISOString() });
    byProduct.set(it.productId, entry);
  }
  const rows: CostComparisonRow[] = [];
  for (const { name, offers } of byProduct.values()) {
    if (offers.size < 2) continue;
    const list = [...offers.values()].sort((a, b) => a.lastCostCents - b.lastCostCents);
    const best = list[0].lastCostCents;
    const worst = list[list.length - 1].lastCostCents;
    rows.push({ productName: name, offers: list, bestCostCents: best, savingPct: worst > 0 ? Math.round(((worst - best) / worst) * 100) : 0 });
  }
  return rows.sort((a, b) => b.savingPct - a.savingPct).slice(0, 50);
}

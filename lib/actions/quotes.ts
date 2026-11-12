"use server";

import { QUOTE_LOST_REASONS, QUOTE_LOST_REASONS_LEGACY, type FollowUpKind } from "@/lib/quote-follow-up";
import { nextDocumentNumber } from "@/lib/document-sequence";
import { revalidatePath } from "next/cache";
import { requireSectionAccess, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { QuoteSchema, type QuoteInput } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";
import type { QuoteStatus } from "@prisma/client";

export type CreateQuoteResult =
  | { success: true; quoteId: string }
  | { success: false; error: string };

export async function createQuote(input: QuoteInput): Promise<CreateQuoteResult> {
  const session = await requireSession();
  const { companyId, userId, sellerName } = session;
  if (!session.branchId) {
    return {
      success: false,
      error: 'Selecciona una sucursal antes de generar un presupuesto — no se puede con "Todas las sucursales".',
    };
  }
  const branchId = session.branchId;
  const parsed = QuoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Carrito inválido" };
  }
  const {
    items,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerAddress,
    note,
    useLocalCurrency,
    validDays,
  } = parsed.data;

  try {
    const quoteId = await withTenant(companyId, async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { exchangeRate: true, exchangeRateEnabled: true },
      });
      // A quote can only be in local currency if the company even has that
      // feature on — otherwise there's nothing to choose between.
      const resolvedUseLocalCurrency = useLocalCurrency && (company?.exchangeRateEnabled ?? false);

      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, companyId, branchId },
      });
      const productById = new Map(products.map((p) => [p.id, p]));

      let totalCents = 0;
      const itemsData = items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new Error("Uno de los productos ya no existe");
        }
        const subtotalCents = product.priceCents * item.quantity;
        totalCents += subtotalCents;
        return {
          productId: product.id,
          productName: product.name,
          category: product.category,
          unitPriceCents: product.priceCents,
          quantity: item.quantity,
          subtotalCents,
        };
      });

      // Quotes reuse the same customer database as sales, so a follow-up sale
      // can autocomplete this customer's data.
      await tx.customer.upsert({
        where: { companyId_phone: { companyId, phone: customerPhone } },
        create: {
          companyId,
          firstName: customerFirstName,
          lastName: customerLastName,
          phone: customerPhone,
          address: customerAddress,
        },
        update: {
          firstName: customerFirstName,
          lastName: customerLastName,
          address: customerAddress,
        },
      });

      const controlNumber = await nextDocumentNumber(tx, branchId, "quote");

      const quote = await tx.quote.create({
        data: {
          totalCents,
          customerFirstName,
          customerLastName,
          customerPhone,
          customerAddress,
          companyId,
          branchId,
          exchangeRate: company?.exchangeRate ?? null,
          useLocalCurrency: resolvedUseLocalCurrency,
          controlNumber,
          sellerId: userId,
          sellerName,
          note: note ?? null,
          validUntil: new Date(Date.now() + validDays * 86_400_000),
          items: { create: itemsData },
        },
      });

      return quote.id;
    });

    return { success: true, quoteId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo generar el presupuesto";
    return { success: false, error: message };
  }
}

export async function getQuote(quoteId: string) {
  const { companyId, branchId } = await requireSectionAccess(["quotes", "documents"]);
  const quote = await withTenant(companyId, (tx) =>
    tx.quote.findFirst({
      where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) },
      include: { items: true },
    })
  );
  if (!quote) return null;
  return { ...quote, exchangeRate: quote.exchangeRate != null ? Number(quote.exchangeRate) : null };
}

export type QuoteConversionLine = {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  maxStock: number;
};

export type QuoteForConversion = {
  quoteId: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  customerAddress: string;
  lines: QuoteConversionLine[];
  // Names of quoted items that got dropped from `lines` because the product
  // no longer exists or was deactivated since the quote was made — shown to
  // the cashier so they know to double check before completing the sale.
  droppedItemNames: string[];
};

// Powers the "Facturar" flow from /quotes/history — prefills the POS cart
// from an existing quote (see app/pos/page.tsx's ?fromQuote= handling)
// instead of making the cashier retype everything. Deliberately re-resolves
// every line against the product's CURRENT price/stock rather than trusting
// the quote's frozen snapshot — same "never trust a stale price" principle
// completeSale already applies to every checkout, quoted or not.
export async function getQuoteForConversion(quoteId: string): Promise<
  { success: true; quote: QuoteForConversion } | { success: false; error: string }
> {
  const { companyId, branchId } = await requireSession();
  if (!branchId) {
    return { success: false, error: 'Selecciona una sucursal antes de facturar un presupuesto — no se puede con "Todas las sucursales".' };
  }

  const quote = await withTenant(companyId, (tx) =>
    tx.quote.findFirst({
      where: { id: quoteId, companyId, branchId },
      include: { items: true, sale: { select: { id: true } } },
    })
  );
  if (!quote) return { success: false, error: "Presupuesto no encontrado" };
  if (quote.sale) return { success: false, error: "Este presupuesto ya fue facturado" };
  if (!quote.customerFirstName || !quote.customerLastName || !quote.customerPhone || !quote.customerAddress) {
    return { success: false, error: "A este presupuesto le faltan datos del cliente" };
  }

  const productIds = quote.items.map((i) => i.productId).filter((id): id is string => id != null);
  const products = await withTenant(companyId, (tx) =>
    tx.product.findMany({ where: { id: { in: productIds }, companyId, branchId } })
  );
  const productById = new Map(products.map((p) => [p.id, p]));

  const lines: QuoteConversionLine[] = [];
  const droppedItemNames: string[] = [];
  for (const item of quote.items) {
    const product = item.productId ? productById.get(item.productId) : undefined;
    if (!product || !product.isActive) {
      droppedItemNames.push(item.productName);
      continue;
    }
    lines.push({
      productId: product.id,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity: Math.max(1, Math.min(item.quantity, product.trackStock ? Math.max(product.stock, 1) : item.quantity)),
      maxStock: product.trackStock ? product.stock : Infinity,
    });
  }

  return {
    success: true,
    quote: {
      quoteId: quote.id,
      customerFirstName: quote.customerFirstName,
      customerLastName: quote.customerLastName,
      customerPhone: quote.customerPhone,
      customerAddress: quote.customerAddress,
      lines,
      droppedItemNames,
    },
  };
}

// Seguimiento de presupuestos: every quote for the current branch (or every
// branch, for a GERENTE viewing "Todas las sucursales"), most recent first.
// `windows` is optional (same pattern as listRecentSales) — omitted by
// callers like the Documentos page that do their own client-side filtering.
export async function listQuotes(limit = 200, windows?: { start: Date; end: Date }[]) {
  const { companyId, branchId } = await requireSectionAccess(["quotes", "documents"]);
  const quotes = await withTenant(companyId, (tx) =>
    tx.quote.findMany({
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        ...(windows ? { OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { sale: { select: { id: true, controlNumber: true } }, followUps: { orderBy: { createdAt: "desc" }, take: 20 } },
    })
  );
  // Prisma's Decimal can't cross the Server->Client Component boundary
  // (every caller of listQuotes renders into a "use client" table) — same
  // conversion getQuote() already does for the single-quote case.
  return quotes.map((q) => ({ ...q, exchangeRate: q.exchangeRate != null ? Number(q.exchangeRate) : null }));
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus, lostReason?: string): Promise<ActionResult> {
  const { companyId, branchId } = await requireSession();
  const result = await withTenant(companyId, (tx) =>
    tx.quote.updateMany({
      where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) },
      data: { status, lostReason: status === "LOST" ? ([...QUOTE_LOST_REASONS, ...QUOTE_LOST_REASONS_LEGACY] as readonly string[]).includes(lostReason ?? "") ? lostReason : null : null },
    })
  );
  if (result.count === 0) {
    return { success: false, error: "Presupuesto no encontrado" };
  }
  revalidatePath("/quotes/history");
  return { success: true };
}

// Bulk version for the "marcar seleccionados" action on /quotes/history —
// same tenant/branch scoping as the single-quote version above, just applied
// to every id in the selection at once.
export async function updateQuoteStatusBulk(quoteIds: string[], status: QuoteStatus): Promise<ActionResult> {
  const { companyId, branchId } = await requireSession();
  if (quoteIds.length === 0) {
    return { success: false, error: "Selecciona al menos un presupuesto" };
  }
  await withTenant(companyId, (tx) =>
    tx.quote.updateMany({
      where: { id: { in: quoteIds }, companyId, ...(branchId ? { branchId } : {}) },
      data: { status, ...(status !== "LOST" ? { lostReason: null } : {}) },
    })
  );
  revalidatePath("/quotes/history");
  return { success: true };
}

// Marca un presupuesto como enviado o visto por el cliente (o quita la marca).
export async function markQuoteStage(quoteId: string, stage: "SENT" | "VIEWED", on: boolean): Promise<ActionResult> {
  const { companyId, branchId } = await requireSession();
  const when = on ? new Date() : null;
  const result = await withTenant(companyId, (tx) =>
    tx.quote.updateMany({
      where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) },
      // Visto implica enviado; quitar enviado quita también visto.
      data: stage === "SENT" ? (on ? { sentAt: when } : { sentAt: null, viewedAt: null }) : on ? { viewedAt: when, sentAt: when } : { viewedAt: null },
    })
  );
  if (result.count === 0) return { success: false, error: "Presupuesto no encontrado" };
  revalidatePath("/quotes/history");
  return { success: true };
}

// Registra una llamada, un mensaje por WhatsApp o una nota en el historial de un presupuesto.
export async function addQuoteFollowUp(quoteId: string, kind: FollowUpKind, text?: string): Promise<ActionResult> {
  const { companyId, branchId, userId, sellerName } = await requireSession();
  if (!["CALL", "WHATSAPP", "NOTE"].includes(kind)) return { success: false, error: "Tipo de seguimiento no válido" };
  const ok = await withTenant(companyId, async (tx) => {
    const quote = await tx.quote.findFirst({ where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) }, select: { id: true } });
    if (!quote) return false;
    await tx.quoteFollowUp.create({ data: { companyId, quoteId, kind, text: text?.trim() || null, createdById: userId, createdBy: sellerName } });
    if (kind === "WHATSAPP") await tx.quote.update({ where: { id: quoteId }, data: { sentAt: new Date() } });
    return true;
  });
  if (!ok) return { success: false, error: "Presupuesto no encontrado" };
  revalidatePath("/quotes/history");
  return { success: true };
}

// «Recordarme en N días» (null quita el recordatorio).
export async function setQuoteReminder(quoteId: string, days: number | null): Promise<ActionResult> {
  const { companyId, branchId } = await requireSession();
  const remindAt = days == null ? null : new Date(Date.now() + days * 86_400_000);
  const r = await withTenant(companyId, (tx) =>
    tx.quote.updateMany({ where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) }, data: { remindAt } })
  );
  if (r.count === 0) return { success: false, error: "Presupuesto no encontrado" };
  revalidatePath("/quotes/history");
  return { success: true };
}

// Copia un presupuesto (mismos productos y cliente, vigencia nueva) con número nuevo.
export async function duplicateQuote(quoteId: string): Promise<ActionResult> {
  const session = await requireSession();
  const { companyId, userId, sellerName } = session;
  if (!session.branchId) return { success: false, error: "Selecciona una sucursal antes de duplicar." };
  const branchId = session.branchId;
  const done = await withTenant(companyId, async (tx) => {
    const q = await tx.quote.findFirst({ where: { id: quoteId, companyId, branchId }, include: { items: true } });
    if (!q) return false;
    const controlNumber = await nextDocumentNumber(tx, branchId, "quote");
    await tx.quote.create({
      data: {
        totalCents: q.totalCents,
        customerFirstName: q.customerFirstName,
        customerLastName: q.customerLastName,
        customerPhone: q.customerPhone,
        customerAddress: q.customerAddress,
        companyId,
        branchId,
        exchangeRate: q.exchangeRate,
        useLocalCurrency: q.useLocalCurrency,
        controlNumber,
        sellerId: userId,
        sellerName,
        note: q.note,
        validUntil: new Date(Date.now() + 15 * 86_400_000),
        items: { create: q.items.map((i) => ({ productId: i.productId, productName: i.productName, category: i.category, unitPriceCents: i.unitPriceCents, quantity: i.quantity, subtotalCents: i.subtotalCents })) },
      },
    });
    return true;
  });
  if (!done) return { success: false, error: "Presupuesto no encontrado" };
  revalidatePath("/quotes/history");
  return { success: true };
}

// Elimina un presupuesto que no se haya facturado.
export async function deleteQuote(quoteId: string): Promise<ActionResult> {
  const { companyId, branchId } = await requireSession();
  const result = await withTenant(companyId, async (tx) => {
    const q = await tx.quote.findFirst({ where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) }, include: { sale: { select: { id: true } } } });
    if (!q) return "Presupuesto no encontrado";
    if (q.sale) return "Este presupuesto ya se facturó y no se puede eliminar";
    await tx.quote.delete({ where: { id: quoteId } });
    return null;
  });
  if (result) return { success: false, error: result };
  revalidatePath("/quotes/history");
  return { success: true };
}

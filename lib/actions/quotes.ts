"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
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

      const previousCount = await tx.quote.count({ where: { branchId } });

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
          controlNumber: previousCount + 1,
          sellerId: userId,
          sellerName,
          note: note ?? null,
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
  const { companyId, branchId } = await requireSession();
  const quote = await withTenant(companyId, (tx) =>
    tx.quote.findFirst({
      where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) },
      include: { items: true },
    })
  );
  if (!quote) return null;
  return { ...quote, exchangeRate: quote.exchangeRate != null ? Number(quote.exchangeRate) : null };
}

// Seguimiento de presupuestos: every quote for the current branch (or every
// branch, for a GERENTE viewing "Todas las sucursales"), most recent first.
// The list page itself sorts PENDING ones to the top so the oldest
// still-open quote — the one most overdue for a follow-up call — surfaces
// first, without needing a separate "reminder date" field on Quote.
export async function listQuotes(limit = 200) {
  const { companyId, branchId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.quote.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  );
}

export async function updateQuoteStatus(quoteId: string, status: QuoteStatus): Promise<ActionResult> {
  const { companyId, branchId } = await requireSession();
  const result = await withTenant(companyId, (tx) =>
    tx.quote.updateMany({
      where: { id: quoteId, companyId, ...(branchId ? { branchId } : {}) },
      data: { status },
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
      data: { status },
    })
  );
  revalidatePath("/quotes/history");
  return { success: true };
}

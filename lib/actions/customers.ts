"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { CustomerRecordSchema, CustomerCrmSchema } from "@/lib/validations";
import { dayBoundsUtc, todayDateString } from "@/lib/report-types";
import type { ActionResult } from "@/lib/types";

export async function listCustomers(query?: string) {
  const { companyId } = await requireSession();
  const q = query?.trim();
  return withTenant(companyId, (tx) =>
    tx.customer.findMany({
      where: {
        companyId,
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { firstName: "asc" },
    })
  );
}

export async function searchCustomers(query: string) {
  const { companyId } = await requireSession();
  const q = query.trim();
  if (!q) return [];
  return withTenant(companyId, (tx) =>
    tx.customer.findMany({
      where: {
        companyId,
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { firstName: "asc" },
      take: 5,
    })
  );
}

export async function findCustomerByPhone(phone: string) {
  const { companyId } = await requireSession();
  const p = phone.trim();
  if (!p) return null;
  return withTenant(companyId, (tx) =>
    tx.customer.findUnique({
      where: { companyId_phone: { companyId, phone: p } },
    })
  );
}

export async function getCustomer(id: string) {
  const { companyId } = await requireSession();
  return withTenant(companyId, (tx) => tx.customer.findFirst({ where: { id, companyId } }));
}

// Ficha de cliente: lifetime totals for the "customer detail" view — mirrors
// the shape of revenueTotals (lib/actions/reports.ts) but scoped to one
// customer instead of a date range, and company-wide (not branch-scoped),
// since a customer can buy at any of the company's branches.
export async function getCustomerStats(customerId: string) {
  const { companyId } = await requireSession();
  return withTenant(companyId, async (tx) => {
    const result = await tx.sale.aggregate({
      _sum: { totalCents: true },
      _count: true,
      _max: { createdAt: true },
      where: { customerId, companyId, voided: false },
    });
    return {
      totalSpentCents: result._sum.totalCents ?? 0,
      purchaseCount: result._count,
      lastPurchaseAt: result._max.createdAt,
    };
  });
}

export async function listSalesForCustomer(customerId: string, limit = 10) {
  const { companyId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.sale.findMany({
      where: { customerId, companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  );
}

// Quotes have no direct link to Customer (they only snapshot customerPhone
// as a plain string, see the Quote model) — phone is the only thing tying a
// quote back to a specific customer, same informal link Sale.customerId
// itself is reconciled from at checkout (see completeSale's customer upsert).
export async function listQuotesForCustomer(phone: string) {
  const { companyId } = await requireSession();
  const p = phone.trim();
  if (!p) return [];
  return withTenant(companyId, (tx) =>
    tx.quote.findMany({
      where: { companyId, customerPhone: p },
      orderBy: { createdAt: "desc" },
    })
  );
}

// "Clientes a contactar" — customers whose reminder date has arrived (today
// or earlier, so a missed reminder stays visible instead of disappearing).
// nextContactDate is a plain calendar date (no time component) — the cutoff
// must be computed in the shop's own timezone (see dayBoundsUtc), not the
// server's, or a reminder set for "today" could show up a day late/early.
export async function listCustomersToContact() {
  const { companyId } = await requireSession();
  const { end: startOfTomorrow } = dayBoundsUtc(todayDateString());
  return withTenant(companyId, (tx) =>
    tx.customer.findMany({
      where: { companyId, nextContactDate: { lt: startOfTomorrow } },
      orderBy: { nextContactDate: "asc" },
    })
  );
}

function readCustomerForm(formData: FormData) {
  return CustomerRecordSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    rif: formData.get("rif"),
  });
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = readCustomerForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await withTenant(companyId, (tx) =>
      tx.customer.create({ data: { ...parsed.data, companyId } })
    );
  } catch {
    return { success: false, error: "Ya existe un cliente con ese teléfono" };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = readCustomerForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    const result = await withTenant(companyId, (tx) =>
      tx.customer.updateMany({
        where: { id, companyId },
        data: parsed.data,
      })
    );
    if (result.count === 0) {
      return { success: false, error: "Cliente no encontrado" };
    }
  } catch {
    return { success: false, error: "Ya existe un cliente con ese teléfono" };
  }

  revalidatePath("/customers");
  return { success: true };
}

// Separate from updateCustomer/CustomerRecordSchema — the ficha de cliente's
// "CRM" screen only ever touches notes/nextContactDate, never the general
// record (name/phone/address/rif), which has its own "Editar" screen.
export async function updateCustomerCrm(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = CustomerCrmSchema.safeParse({
    notes: formData.get("notes"),
    nextContactDate: formData.get("nextContactDate"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const result = await withTenant(companyId, (tx) =>
    tx.customer.updateMany({
      where: { id, companyId },
      data: parsed.data,
    })
  );
  if (result.count === 0) {
    return { success: false, error: "Cliente no encontrado" };
  }

  revalidatePath(`/customers/${id}/crm`);
  return { success: true };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.customer.deleteMany({ where: { id, companyId } }));
  revalidatePath("/customers");
  return { success: true };
}

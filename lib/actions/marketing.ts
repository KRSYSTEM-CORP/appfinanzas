"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSectionAccess, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { FREQUENT_VISITS, INACTIVE_DAYS, segmentOf, type SegmentId } from "@/lib/marketing";
import type { ActionResult } from "@/lib/types";

export type CustomerInsight = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  visits: number;
  spentCents: number;
  lastVisit: string | null;
  nextContactDate: string | null;
  birthDate: string | null;
  segment: SegmentId;
};

export type MarketingInsights = {
  customers: CustomerInsight[];
  kpis: { registered: number; frequent: number; inactive: number; birthdays: number };
  segmentCounts: Record<SegmentId, number>;
};

// Clientes con visitas, gasto y grupo; y los indicadores de Marketing (Registrados, Frecuentes, Inactivos, Cumpleañeros).
export async function getMarketingInsights(): Promise<MarketingInsights> {
  const { companyId } = await requireSectionAccess("customers");
  return withTenant(companyId, async (tx) => {
    const [customers, grouped] = await Promise.all([
      tx.customer.findMany({ where: { companyId }, orderBy: { firstName: "asc" } }),
      tx.sale.groupBy({
        by: ["customerId"],
        where: { companyId, voided: false, customerId: { not: null } },
        _count: true,
        _sum: { totalCents: true },
        _max: { createdAt: true },
      }),
    ]);
    const stats = new Map(grouped.map((g) => [g.customerId as string, g]));
    const totalSpent = grouped.reduce((s, g) => s + (g._sum.totalCents ?? 0), 0);
    const buyers = grouped.length;
    const avg = buyers ? totalSpent / buyers : 0;
    const now = new Date();
    const segmentCounts: Record<SegmentId, number> = { campeones: 0, leales: 0, riesgo: 0, dormidos: 0 };
    let frequent = 0;
    let inactive = 0;
    let birthdays = 0;
    const rows = customers.map((c): CustomerInsight => {
      const st = stats.get(c.id);
      const visits = st?._count ?? 0;
      const spent = st?._sum.totalCents ?? 0;
      const last = st?._max.createdAt ?? null;
      const segment = segmentOf(visits, spent, avg, last, now);
      segmentCounts[segment]++;
      if (visits >= FREQUENT_VISITS) frequent++;
      if (last && now.getTime() - last.getTime() > INACTIVE_DAYS * 86_400_000) inactive++;
      if (c.birthDate) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), c.birthDate.getUTCMonth(), c.birthDate.getUTCDate()));
        const diff = Math.round((d.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
        if (diff >= 0 && diff <= 30) birthdays++;
      }
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        visits,
        spentCents: spent,
        lastVisit: last?.toISOString() ?? null,
        nextContactDate: c.nextContactDate?.toISOString() ?? null,
        birthDate: c.birthDate?.toISOString() ?? null,
        segment,
      };
    });
    return { customers: rows, kpis: { registered: customers.length, frequent, inactive, birthdays }, segmentCounts };
  });
}

const ImportRow = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(4),
  address: z.string().trim().default("—"),
  rif: z.string().trim().optional(),
  email: z.string().trim().optional(),
});

// Importa clientes desde las filas de un Excel (Nombre, Apellido, Teléfono, Dirección, Cédula/RIF, Correo).
export async function importCustomers(rows: unknown[]): Promise<{ success: true; created: number; updated: number; skipped: number } | { success: false; error: string }> {
  const { companyId } = await requireSectionAccess("customers");
  if (!Array.isArray(rows) || rows.length === 0) return { success: false, error: "El archivo no tiene filas" };
  if (rows.length > 2000) return { success: false, error: "Máximo 2.000 clientes por archivo" };
  let created = 0;
  let updated = 0;
  let skipped = 0;
  await withTenant(companyId, async (tx) => {
    for (const raw of rows) {
      const parsed = ImportRow.safeParse(raw);
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const d = parsed.data;
      const existing = await tx.customer.findUnique({ where: { companyId_phone: { companyId, phone: d.phone } }, select: { id: true } });
      await tx.customer.upsert({
        where: { companyId_phone: { companyId, phone: d.phone } },
        create: { companyId, firstName: d.firstName, lastName: d.lastName, phone: d.phone, address: d.address, rif: d.rif || null, email: d.email || null },
        update: { firstName: d.firstName, lastName: d.lastName, address: d.address, rif: d.rif || null, email: d.email || null },
      });
      if (existing) updated++;
      else created++;
    }
  });
  revalidatePath("/customers");
  return { success: true, created, updated, skipped };
}

export type PromotionRow = {
  id: string;
  name: string;
  code: string;
  discountPercent: number;
  segment: string;
  validUntil: string;
  redemptions: number;
};

export async function listPromotions(): Promise<PromotionRow[]> {
  const { companyId } = await requireSectionAccess("customers");
  const rows = await withTenant(companyId, (tx) =>
    tx.promotion.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { redemptions: true } } } })
  );
  return rows.map((p) => ({ id: p.id, name: p.name, code: p.code, discountPercent: p.discountPercent, segment: p.segment, validUntil: p.validUntil.toISOString(), redemptions: p._count.redemptions }));
}

const NewPromotion = z.object({
  name: z.string().trim().min(2, "Escribe un nombre").max(60),
  discountPercent: z.number().int().min(1, "El descuento mínimo es 1 %").max(90, "El descuento máximo es 90 %"),
  days: z.number().int().min(1).max(90),
  segment: z.enum(["todos", "campeones", "leales", "riesgo", "dormidos", "cumpleaneros"]),
});

function makeCode(name: string): string {
  const base = name.normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 5) || "PROMO";
  return `${base}${Math.floor(10 + Math.random() * 90)}`;
}

export async function createPromotion(input: unknown): Promise<ActionResult> {
  const { companyId } = await requireSectionAccess("customers");
  const parsed = NewPromotion.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  const d = parsed.data;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await withTenant(companyId, (tx) =>
        tx.promotion.create({ data: { companyId, name: d.name, code: makeCode(d.name), discountPercent: d.discountPercent, segment: d.segment, validUntil: new Date(Date.now() + d.days * 86_400_000) } })
      );
      revalidatePath("/customers/promotions");
      return { success: true };
    } catch {
      // código repetido: se genera otro
    }
  }
  return { success: false, error: "No se pudo generar un código único" };
}

export async function registerRedemption(promotionId: string, note?: string): Promise<ActionResult> {
  const { companyId } = await requireSectionAccess("customers");
  const ok = await withTenant(companyId, async (tx) => {
    const p = await tx.promotion.findFirst({ where: { id: promotionId, companyId } });
    if (!p) return "Promoción no encontrada";
    if (p.validUntil < new Date()) return "La promoción ya venció";
    await tx.promotionRedemption.create({ data: { companyId, promotionId, note: note?.trim() || null } });
    return null;
  });
  if (ok) return { success: false, error: ok };
  revalidatePath("/customers/promotions");
  return { success: true };
}


// Interruptor «Exigir nombre y teléfono en cada venta» (Marketing). El POS lo respeta y el
// servidor lo vuelve a validar al completar la venta.
export async function getRequireCustomerOnSale(): Promise<boolean> {
  const { companyId } = await requireSession();
  const c = await withTenant(companyId, (tx) => tx.company.findUnique({ where: { id: companyId }, select: { requireCustomerOnSale: true } }));
  return c?.requireCustomerOnSale ?? false;
}

export async function setRequireCustomerOnSale(value: boolean): Promise<ActionResult> {
  const { companyId, role } = await requireSectionAccess("customers");
  if (role !== "GERENTE") return { success: false, error: "Solo el gerente puede cambiar esta regla." };
  await withTenant(companyId, (tx) => tx.company.update({ where: { id: companyId }, data: { requireCustomerOnSale: value } }));
  revalidatePath("/customers");
  revalidatePath("/pos");
  return { success: true };
}

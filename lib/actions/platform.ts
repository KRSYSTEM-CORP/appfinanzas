"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withSuperAdmin } from "@/lib/tenant-db";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { AUDIT_ACTIONS, logPlatformAudit, type AuditAction } from "@/lib/platform-audit";
import { sendAnnouncementEmail } from "@/lib/email";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { getPlatformExchangeRateInfo } from "@/lib/actions/billing";
import { couponLabel, isValidCouponCode, normalizeCouponCode } from "@/lib/coupons";
import {
  audienceLabel,
  fillTemplate,
  isSegment,
  selectRecipients,
  type Audience,
  type OwnerStatus,
  type PlatformCompany,
} from "@/lib/platform-logic";
import type { ActionResult } from "@/lib/types";

// Todas las acciones de este archivo validan superadmin en el servidor (requireSuperAdmin).

const MAX_RECIPIENTS_PER_SEND = 300;
const SENDS_PER_HOUR = 10;

// ---------------------------------------------------------------- directorio de empresas
export type DirectoryRow = PlatformCompany & {
  ownerId: string;
  ownerName: string;
  phone: string | null;
  enabledFeatures: string[];
  monthlyFeeUsdCents: number | null;
  usersActive: number;
  userCount: number;
  productCount: number;
  aiCreditsExtra: number;
  aiCreditsUsed: number;
  lastPayment: { amountUsdCents: number; createdAt: Date } | null;
  crmNote: string | null;
  crmNextContactAt: Date | null;
  crmTags: string[];
  employees: { id: string; name: string; role: string; status: OwnerStatus }[];
};

// Una fila por empresa con dueño, uso, último pago, última actividad (última venta) y datos del CRM.
export async function getCompanyDirectory(): Promise<DirectoryRow[]> {
  await requireSuperAdmin();
  const [companies, sales, products, payments] = await withSuperAdmin((tx) =>
    Promise.all([
      tx.company.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          plan: true,
          isExempt: true,
          nextPaymentDueDate: true,
          monthlyFeeUsdCents: true,
          createdAt: true,
          enabledFeatures: true,
          fiscalPhone: true,
          businessWhatsapp: true,
          ownerPhone: true,
          aiCreditsExtra: true,
          aiCreditsUsed: true,
          crmNote: true,
          crmNextContactAt: true,
          crmTags: true,
          users: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            select: { id: true, email: true, firstName: true, lastName: true, role: true, status: true },
          },
        },
      }),
      tx.sale.groupBy({ by: ["companyId"], _max: { createdAt: true } }),
      tx.product.groupBy({ by: ["companyId"], _count: { _all: true } }),
      tx.payment.findMany({ orderBy: { createdAt: "desc" }, select: { companyId: true, amountUsdCents: true, createdAt: true } }),
    ])
  );
  const lastSale = new Map(sales.map((s) => [s.companyId, s._max.createdAt]));
  const productCount = new Map(products.map((p) => [p.companyId, p._count._all]));
  const lastPay = new Map<string, { amountUsdCents: number; createdAt: Date }>();
  for (const p of payments) if (!lastPay.has(p.companyId)) lastPay.set(p.companyId, { amountUsdCents: p.amountUsdCents, createdAt: p.createdAt });

  return companies
    .filter((c) => c.users.length > 0)
    .map((c) => {
      const owner = c.users[0];
      const name = (u: { firstName: string | null; lastName: string | null; email: string }) =>
        u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email;
      return {
        id: c.id,
        name: c.name,
        plan: c.plan,
        isExempt: c.isExempt,
        nextPaymentDueDate: c.nextPaymentDueDate,
        ownerStatus: owner.status,
        ownerEmail: owner.email,
        ownerId: owner.id,
        ownerName: name(owner),
        createdAt: c.createdAt,
        lastActivityAt: lastSale.get(c.id) ?? null,
        phone: c.ownerPhone || c.businessWhatsapp || c.fiscalPhone || null,
        enabledFeatures: c.enabledFeatures,
        monthlyFeeUsdCents: c.monthlyFeeUsdCents,
        usersActive: c.users.filter((u) => u.status === "ACTIVE").length,
        userCount: c.users.length,
        productCount: productCount.get(c.id) ?? 0,
        aiCreditsExtra: c.aiCreditsExtra,
        aiCreditsUsed: c.aiCreditsUsed,
        lastPayment: lastPay.get(c.id) ?? null,
        crmNote: c.crmNote,
        crmNextContactAt: c.crmNextContactAt,
        crmTags: c.crmTags,
        employees: c.users.slice(1).map((u) => ({ id: u.id, name: name(u), role: u.role, status: u.status })),
      };
    });
}

// Ingresos de suscripción del mes en curso (pagos aprobados y registrados a mano), en centavos de USD.
export async function getMonthIncomeUsdCents(): Promise<number> {
  await requireSuperAdmin();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await withSuperAdmin((tx) => tx.payment.aggregate({ where: { createdAt: { gte: start } }, _sum: { amountUsdCents: true } }));
  return agg._sum.amountUsdCents ?? 0;
}

// ---------------------------------------------------------------- correos masivos y cupones
const AudienceSchema = z.union([
  z.object({ kind: z.literal("segment"), segment: z.string().refine(isSegment, "Segmento inválido") }),
  z.object({ kind: z.literal("selected"), ids: z.array(z.string()).max(500) }),
]);

const BulkMailSchema = z.object({
  subject: z.string().trim().min(1, "El asunto es obligatorio").max(150),
  message: z.string().trim().min(1, "El mensaje es obligatorio").max(5000),
  audience: AudienceSchema,
});

export type BulkSendResult = { success: true; sent: number; total: number } | { success: false; error: string };

async function sendToRecipients(
  recipients: DirectoryRow[],
  subject: string,
  message: string,
  now: Date,
  extra?: (c: DirectoryRow) => Record<string, string>
): Promise<number> {
  let sent = 0;
  for (let i = 0; i < recipients.length; i += 10) {
    const chunk = recipients.slice(i, i + 10);
    const results = await Promise.allSettled(
      chunk.map((c) => sendAnnouncementEmail(c.ownerEmail, fillTemplate(subject, c, now, extra?.(c)), fillTemplate(message, c, now, extra?.(c))))
    );
    sent += results.filter((r) => r.status === "fulfilled" && r.value).length;
  }
  return sent;
}

async function checkSendBudget(userId: string): Promise<string | null> {
  const status = await checkRateLimit("platform-mail", userId, SENDS_PER_HOUR, 60 * 60_000);
  return status.allowed ? null : `Límite de envíos alcanzado (${SENDS_PER_HOUR} por hora). Intenta en ${status.retryAfterMinutes} minutos.`;
}

// Cuenta previa de destinatarios para un público (no envía nada).
export async function countRecipients(audience: Audience): Promise<number> {
  await requireSuperAdmin();
  const parsed = AudienceSchema.safeParse(audience);
  if (!parsed.success) return 0;
  return selectRecipients(await getCompanyDirectory(), parsed.data as Audience, new Date()).length;
}

// Correo/anuncio masivo a las empresas: el texto admite {{empresa}}, {{plan}}, {{vencimiento}} y {{dias}}.
export async function sendBulkEmail(input: unknown): Promise<BulkSendResult> {
  const session = await requireSuperAdmin();
  const parsed = BulkMailSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const limited = await checkSendBudget(session.userId);
  if (limited) return { success: false, error: limited };

  const now = new Date();
  const audience = parsed.data.audience as Audience;
  const recipients = selectRecipients(await getCompanyDirectory(), audience, now);
  if (recipients.length === 0) return { success: false, error: "No hay empresas que reciban este correo." };
  if (recipients.length > MAX_RECIPIENTS_PER_SEND) return { success: false, error: `Máximo ${MAX_RECIPIENTS_PER_SEND} destinatarios por envío.` };

  await recordFailedAttempt("platform-mail", session.userId);
  const sent = await sendToRecipients(recipients, parsed.data.subject, parsed.data.message, now);
  await prisma.platformEmailLog.create({ data: { kind: "ANNOUNCEMENT", subject: parsed.data.subject, audience: audienceLabel(audience), recipients: recipients.length, sent } });
  await logPlatformAudit(session.userId, "correo.masivo", { detail: `${parsed.data.subject} · ${audienceLabel(audience)} · ${sent}/${recipients.length}` });
  revalidatePath("/admin/marketing");
  return { success: true, sent, total: recipients.length };
}

// Recordatorio de vencimiento a UNA empresa (cola de Cobranza).
export async function sendDueReminder(companyId: string): Promise<BulkSendResult> {
  const session = await requireSuperAdmin();
  const limited = await checkSendBudget(session.userId);
  if (limited) return { success: false, error: limited };
  const row = (await getCompanyDirectory()).find((c) => c.id === companyId);
  if (!row) return { success: false, error: "Empresa no encontrada" };
  if (row.ownerEmail.endsWith("@kyra.local")) return { success: false, error: "Esta empresa no tiene un correo real." };
  const now = new Date();
  await recordFailedAttempt("platform-mail", session.userId);
  const subject = "Tu suscripción de KR POS vence pronto";
  const message = "Hola {{empresa}},\n\nTu plan {{plan}} vence el {{vencimiento}} ({{dias}}). Para seguir usando KR POS sin interrupciones, renueva desde Ajustes → Mi plan.\n\nGracias por confiar en KR System.";
  const sent = await sendToRecipients([row], subject, message, now);
  await prisma.platformEmailLog.create({ data: { kind: "REMINDER", subject, audience: row.name, recipients: 1, sent } });
  await logPlatformAudit(session.userId, "correo.masivo", { companyId, detail: `Recordatorio de vencimiento · ${sent}/1` });
  return sent === 1 ? { success: true, sent, total: 1 } : { success: false, error: "No se pudo enviar el correo." };
}

export async function listEmailLog(take = 30) {
  await requireSuperAdmin();
  return prisma.platformEmailLog.findMany({ orderBy: { createdAt: "desc" }, take });
}

// ---------------------------------------------------------------- cupones
export type CouponRow = {
  id: string;
  code: string;
  discountType: string;
  percentOff: number | null;
  amountOffUsd: number | null;
  plan: string | null;
  companyId: string | null;
  companyName: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAt: Date;
};

export async function listCoupons(): Promise<CouponRow[]> {
  await requireSuperAdmin();
  const rows = await withSuperAdmin((tx) => tx.platformCoupon.findMany({ orderBy: { createdAt: "desc" }, include: { company: { select: { name: true } } } }));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    discountType: r.discountType,
    percentOff: r.percentOff,
    amountOffUsd: r.amountOffUsd,
    plan: r.plan,
    companyId: r.companyId,
    companyName: r.company?.name ?? null,
    expiresAt: r.expiresAt,
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    active: r.active,
    createdAt: r.createdAt,
  }));
}

const CouponSchema = z
  .object({
    code: z.string().transform(normalizeCouponCode).refine(isValidCouponCode, "El código lleva de 3 a 24 letras, números, - o _"),
    discountType: z.enum(["PERCENT", "AMOUNT"]),
    value: z.coerce.number().positive("El descuento debe ser mayor a 0"),
    plan: z.enum(["EMPRENDE", "PYME", "CORPORATIVO"]).nullable().optional(),
    companyId: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    maxUses: z.coerce.number().int().min(1, "Los usos máximos deben ser al menos 1").max(100_000).nullable().optional(),
  })
  .refine((v) => v.discountType !== "PERCENT" || v.value <= 100, { message: "El porcentaje no puede pasar de 100", path: ["value"] });

export async function createCoupon(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = CouponSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const v = parsed.data;
  let expiresAt: Date | null = null;
  if (v.expiresAt) {
    expiresAt = new Date(`${v.expiresAt}T23:59:59Z`);
    if (Number.isNaN(expiresAt.getTime())) return { success: false, error: "Fecha de vigencia inválida" };
  }
  if (v.companyId) {
    const exists = await withSuperAdmin((tx) => tx.company.findUnique({ where: { id: v.companyId! }, select: { id: true } }));
    if (!exists) return { success: false, error: "Empresa no encontrada" };
  }
  if (await withSuperAdmin((tx) => tx.platformCoupon.findUnique({ where: { code: v.code } }))) {
    return { success: false, error: "Ya existe un cupón con ese código" };
  }
  await withSuperAdmin((tx) =>
    tx.platformCoupon.create({
      data: {
        code: v.code,
        discountType: v.discountType,
        percentOff: v.discountType === "PERCENT" ? Math.round(v.value) : null,
        amountOffUsd: v.discountType === "AMOUNT" ? Math.round(v.value * 100) : null,
        plan: v.plan ?? null,
        companyId: v.companyId ?? null,
        expiresAt,
        // Por defecto 1 uso: un cupón entregado a una empresa se agota al usarse.
        maxUses: v.maxUses ?? 1,
      },
    })
  );
  await logPlatformAudit(session.userId, "cupon.crear", { companyId: v.companyId ?? null, detail: v.code });
  revalidatePath("/admin/cupones");
  return { success: true };
}

export async function setCouponActive(id: string, active: boolean): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const c = await withSuperAdmin((tx) => tx.platformCoupon.update({ where: { id }, data: { active }, select: { code: true, companyId: true } }));
  await logPlatformAudit(session.userId, "cupon.estado", { companyId: c.companyId, detail: `${c.code}: ${active ? "activo" : "inactivo"}` });
  revalidatePath("/admin/cupones");
  return { success: true };
}

export type CouponRedemptionRow = { id: string; code: string; companyName: string; discountUsdCents: number; createdAt: Date; confirmed: boolean };

export async function listCouponRedemptions(): Promise<CouponRedemptionRow[]> {
  await requireSuperAdmin();
  const rows = await withSuperAdmin((tx) =>
    tx.platformCouponRedemption.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { coupon: { select: { code: true } }, company: { select: { name: true } } },
    })
  );
  const reportIds = rows.map((r) => r.paymentReportId).filter((x): x is string => !!x);
  const approved = reportIds.length
    ? await withSuperAdmin((tx) => tx.paymentReport.findMany({ where: { id: { in: reportIds }, status: "APPROVED" }, select: { id: true } }))
    : [];
  const ok = new Set(approved.map((a) => a.id));
  return rows.map((r) => ({
    id: r.id,
    code: r.coupon.code,
    companyName: r.company.name,
    discountUsdCents: r.discountUsdCents,
    createdAt: r.createdAt,
    confirmed: r.paymentReportId ? ok.has(r.paymentReportId) : false,
  }));
}

const SendCouponSchema = z.object({
  couponId: z.string(),
  subject: z.string().trim().min(1, "El asunto es obligatorio").max(150),
  message: z.string().trim().min(1, "El mensaje es obligatorio").max(5000),
  audience: AudienceSchema,
});

// Envía un cupón por correo a una empresa, a un segmento o a empresas elegidas. El texto admite
// {{codigo}} y {{cupon}} (descripción del descuento). Un cupón de una empresa solo va a esa empresa.
export async function sendCouponEmail(input: unknown): Promise<BulkSendResult> {
  const session = await requireSuperAdmin();
  const parsed = SendCouponSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const limited = await checkSendBudget(session.userId);
  if (limited) return { success: false, error: limited };

  const coupon = await withSuperAdmin((tx) => tx.platformCoupon.findUnique({ where: { id: parsed.data.couponId } }));
  if (!coupon) return { success: false, error: "Cupón no encontrado" };
  if (!coupon.active) return { success: false, error: "Activa el cupón antes de enviarlo." };

  const now = new Date();
  const audience = parsed.data.audience as Audience;
  let recipients = selectRecipients(await getCompanyDirectory(), audience, now);
  if (coupon.companyId) recipients = recipients.filter((r) => r.id === coupon.companyId);
  if (coupon.plan) recipients = recipients.filter((r) => r.plan === coupon.plan);
  if (recipients.length === 0) return { success: false, error: "No hay empresas a las que se pueda enviar este cupón." };
  if (recipients.length > MAX_RECIPIENTS_PER_SEND) return { success: false, error: `Máximo ${MAX_RECIPIENTS_PER_SEND} destinatarios por envío.` };

  await recordFailedAttempt("platform-mail", session.userId);
  const extra = { codigo: coupon.code, cupon: couponLabel(coupon) };
  const sent = await sendToRecipients(recipients, parsed.data.subject, parsed.data.message, now, () => extra);
  await prisma.platformEmailLog.create({ data: { kind: "COUPON", subject: `${parsed.data.subject} (${coupon.code})`, audience: audienceLabel(audience), recipients: recipients.length, sent } });
  await logPlatformAudit(session.userId, "cupon.enviar", { companyId: recipients.length === 1 ? recipients[0].id : null, detail: `${coupon.code} · ${sent}/${recipients.length}` });
  revalidatePath("/admin/cupones");
  return { success: true, sent, total: recipients.length };
}

// ---------------------------------------------------------------- avisos dentro de la app
export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  tone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  segment: string | null;
  active: boolean;
  createdAt: Date;
};

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  await requireSuperAdmin();
  return prisma.platformAnnouncement.findMany({ orderBy: { createdAt: "desc" } });
}

const AnnouncementInSchema = z.object({
  title: z.string().trim().min(2, "Escribe el título").max(100),
  body: z.string().trim().min(2, "Escribe el texto").max(500),
  tone: z.enum(["info", "ok", "warn", "bad"]),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
});

export async function createAnnouncement(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = AnnouncementInSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const v = parsed.data;
  const segment = v.segment && v.segment !== "todas" ? v.segment : null;
  if (segment && !isSegment(segment)) return { success: false, error: "Segmento inválido" };
  const startsAt = v.startsAt ? new Date(`${v.startsAt}T00:00:00Z`) : null;
  const endsAt = v.endsAt ? new Date(`${v.endsAt}T23:59:59Z`) : null;
  if ((startsAt && Number.isNaN(startsAt.getTime())) || (endsAt && Number.isNaN(endsAt.getTime()))) return { success: false, error: "Fecha inválida" };
  if (startsAt && endsAt && endsAt < startsAt) return { success: false, error: "La vigencia termina antes de empezar" };
  await prisma.platformAnnouncement.create({ data: { title: v.title, body: v.body, tone: v.tone, startsAt, endsAt, segment } });
  await logPlatformAudit(session.userId, "aviso.crear", { detail: v.title });
  revalidatePath("/admin/anuncios");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function setAnnouncementActive(id: string, active: boolean): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const a = await prisma.platformAnnouncement.update({ where: { id }, data: { active }, select: { title: true } });
  await logPlatformAudit(session.userId, "aviso.estado", { detail: `${a.title}: ${active ? "activo" : "inactivo"}` });
  revalidatePath("/admin/anuncios");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const a = await prisma.platformAnnouncement.findUnique({ where: { id }, select: { title: true } });
  await prisma.platformAnnouncement.deleteMany({ where: { id } });
  await logPlatformAudit(session.userId, "aviso.eliminar", { detail: a?.title });
  revalidatePath("/admin/anuncios");
  revalidatePath("/", "layout");
  return { success: true };
}

// ---------------------------------------------------------------- auditoría
export type AuditFilters = { action?: string; q?: string; from?: string; to?: string };

export async function listAuditLog(f: AuditFilters = {}, take = 200) {
  await requireSuperAdmin();
  const where: Record<string, unknown> = {};
  if (f.action && f.action in AUDIT_ACTIONS) where.action = f.action as AuditAction;
  if (f.q?.trim()) where.companyName = { contains: f.q.trim(), mode: "insensitive" };
  const range: { gte?: Date; lte?: Date } = {};
  if (f.from) range.gte = new Date(`${f.from}T00:00:00Z`);
  if (f.to) range.lte = new Date(`${f.to}T23:59:59Z`);
  if (range.gte || range.lte) where.createdAt = range;
  return prisma.platformAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, take });
}

// ---------------------------------------------------------------- salud de la plataforma
export type PlatformHealth = {
  dbSizeMb: number | null;
  dbAlertMb: number;
  bcvRate: number | null;
  bcvUpdatedAt: Date | null;
  companies: number;
  users: number;
  lastSignupAt: Date | null;
};

export async function getPlatformHealth(): Promise<PlatformHealth> {
  await requireSuperAdmin();
  const [size, rate, counts] = await Promise.all([
    withSuperAdmin((tx) => tx.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`).catch(() => null),
    getPlatformExchangeRateInfo(),
    withSuperAdmin((tx) => Promise.all([tx.company.count(), tx.user.count(), tx.company.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } })])),
  ]);
  return {
    dbSizeMb: size?.[0] ? Math.round((Number(size[0].bytes) / (1024 * 1024)) * 10) / 10 : null,
    dbAlertMb: 100,
    bcvRate: rate.rate,
    bcvUpdatedAt: rate.updatedAt,
    companies: counts[0],
    users: counts[1],
    lastSignupAt: counts[2]?.createdAt ?? null,
  };
}

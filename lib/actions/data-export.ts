"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { buildDailyReport } from "@/lib/daily-report";
import { sendWeeklyReportEmail } from "@/lib/email";
import { checkRateLimit, rateLimitMessage } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/types";

type Cell = string | number | null;

// Historial de ventas (hoja de Excel): una fila por venta no anulada, las más recientes primero.
export async function exportSalesHistory(): Promise<Cell[][]> {
  const { companyId, branchId } = await requireManager();
  return withTenant(companyId, async (tx) => {
    const sales = await tx.sale.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}), voided: false },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        createdAt: true, controlNumber: true, customerFirstName: true, customerLastName: true,
        totalCents: true, baseImponibleCents: true, taxCents: true, paymentStatus: true,
      },
    });
    return [
      ["Fecha", "N.º", "Cliente", "Base imponible", "IVA", "Total", "Estado de pago"],
      ...sales.map((s): Cell[] => [
        s.createdAt.toISOString().slice(0, 16).replace("T", " "),
        s.controlNumber ?? null,
        [s.customerFirstName, s.customerLastName].filter(Boolean).join(" ") || "Consumidor final",
        s.baseImponibleCents / 100,
        s.taxCents / 100,
        s.totalCents / 100,
        String(s.paymentStatus),
      ]),
    ];
  });
}

// Respaldo de cobros: cada pago recibido, con su método, moneda y referencia.
export async function exportPaymentsBackup(): Promise<Cell[][]> {
  const { companyId, branchId } = await requireManager();
  return withTenant(companyId, async (tx) => {
    const pays = await tx.salePayment.findMany({
      where: { sale: { companyId, ...(branchId ? { branchId } : {}), voided: false } },
      orderBy: { createdAt: "desc" },
      take: 10000,
      select: {
        createdAt: true, paymentMethod: true, currencyCode: true, amountCurrencyCents: true,
        amountEurCents: true, reference: true, sale: { select: { controlNumber: true } },
      },
    });
    return [
      ["Fecha", "Venta N.º", "Método", "Moneda", "Monto", "Equivalente (referencia)", "Referencia"],
      ...pays.map((p): Cell[] => [
        p.createdAt.toISOString().slice(0, 16).replace("T", " "),
        p.sale.controlNumber ?? null,
        String(p.paymentMethod),
        p.currencyCode ?? null,
        (p.amountCurrencyCents ?? p.amountEurCents) / 100,
        p.amountEurCents / 100,
        p.reference ?? null,
      ]),
    ];
  });
}

export async function getDailyReportEmails(): Promise<string[]> {
  const { companyId } = await requireManager();
  const c = await withTenant(companyId, (tx) => tx.company.findUnique({ where: { id: companyId }, select: { dailyReportEmails: true } }));
  return c?.dailyReportEmails ?? [];
}

const EmailsSchema = z.array(z.string().trim().toLowerCase().email("Hay un correo con formato inválido")).max(5, "Máximo 5 correos");

export async function setDailyReportEmails(emails: string[]): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = EmailsSchema.safeParse([...new Set(emails.map((e) => e.trim()).filter(Boolean))]);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  await withTenant(companyId, (tx) => tx.company.update({ where: { id: companyId }, data: { dailyReportEmails: parsed.data } }));
  revalidatePath("/settings");
  return { success: true };
}

// «Enviar prueba»: manda el reporte de hoy a los correos guardados (máx. 3 pruebas cada 10 min).
export async function sendDailyReportTest(): Promise<ActionResult> {
  const { companyId, userId } = await requireManager();
  const limit = await checkRateLimit("daily-report-test", userId, 3, 10 * 60_000);
  if (!limit.allowed) return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };
  const r = await buildDailyReport(companyId);
  if (!r || r.emails.length === 0) return { success: false, error: "Guarda al menos un correo antes de enviar la prueba." };
  let sent = 0;
  for (const to of r.emails) if (await sendWeeklyReportEmail(to, `Prueba: ${r.subject}`, r.body)) sent++;
  if (sent === 0) return { success: false, error: "No se pudo enviar el correo. Revisa la configuración del servicio de correo." };
  return { success: true };
}

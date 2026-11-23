import { prisma } from "@/lib/prisma";

// Etiquetas legibles de cada acción auditada (también sirven de filtro en Plataforma → Auditoría).
export const AUDIT_ACTIONS = {
  "empresa.aprobar": "Aprobó una empresa",
  "empresa.rechazar": "Rechazó una empresa",
  "empresa.suspender": "Suspendió una empresa",
  "empresa.reactivar": "Reactivó una empresa",
  "empresa.eliminar": "Eliminó una empresa",
  "empresa.plan": "Cambió el plan",
  "empresa.exencion": "Cambió la exención de pago",
  "empresa.funciones": "Cambió las funciones extra",
  "empresa.creditos": "Regaló créditos de IA",
  "empresa.crm": "Editó notas o etiquetas del CRM",
  "prueba.extender": "Dio días gratis a una empresa",
  "pago.registrar": "Registró un pago",
  "pago.renovar": "Renovó la suscripción",
  "pago.aprobar": "Aprobó un reporte de pago",
  "pago.rechazar": "Rechazó un reporte de pago",
  "pago.metodo": "Cambió un método de pago de suscripción",
  "creditos.resolver": "Resolvió una solicitud de créditos",
  "cupon.crear": "Creó un cupón",
  "cupon.estado": "Activó o desactivó un cupón",
  "cupon.enviar": "Envió un cupón por correo",
  "correo.masivo": "Envió un correo masivo",
  "aviso.crear": "Creó un aviso en la app",
  "aviso.estado": "Activó o desactivó un aviso",
  "aviso.eliminar": "Eliminó un aviso",
  "video.subir": "Agregó un video de Learning",
  "video.quitar": "Quitó un video de Learning",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

// Anota una acción del superadministrador. Nunca rompe la acción principal si falla el registro.
export async function logPlatformAudit(
  actorId: string,
  action: AuditAction,
  opts: { companyId?: string | null; companyName?: string | null; detail?: string | null } = {}
): Promise<void> {
  try {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { email: true } });
    let companyName = opts.companyName ?? null;
    if (!companyName && opts.companyId) {
      const c = await prisma.company.findUnique({ where: { id: opts.companyId }, select: { name: true } });
      companyName = c?.name ?? null;
    }
    await prisma.platformAuditLog.create({
      data: {
        actorId,
        actorEmail: actor?.email ?? actorId,
        action,
        companyId: opts.companyId ?? null,
        companyName,
        detail: opts.detail?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    console.error("[audit] no se pudo registrar", action, err);
  }
}

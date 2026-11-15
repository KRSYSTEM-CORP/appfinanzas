import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { withSuperAdmin } from "@/lib/tenant-db";
import { getCompanyDirectory, listAuditLog, listCouponRedemptions } from "@/lib/actions/platform";
import { AUDIT_ACTIONS } from "@/lib/platform-audit";
import { companyState, STATE_LABELS, toCsv } from "@/lib/platform-logic";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { PLANS } from "@/lib/plans";

// Exportaciones a CSV (abre directo en Excel) de la Plataforma: empresas, pagos de suscripción,
// canjes de cupones y auditoría. Solo superadmin: se valida la sesión aquí y en cada lectura.
export const dynamic = "force-dynamic";

const money = (cents: number) => (cents / 100).toFixed(2);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.locked || !session.isSuperAdmin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const p = request.nextUrl.searchParams;
  const kind = p.get("kind");
  const now = new Date();
  let csv: string;

  if (kind === "empresas") {
    const rows = await getCompanyDirectory();
    csv = toCsv(
      ["Empresa", "Correo del dueño", "Teléfono", "Plan", "Estado", "Vencimiento", "Mensualidad USD", "Usuarios activos", "Productos", "Último pago USD", "Último pago", "Última venta", "Registrada", "Etiquetas"],
      rows.map((r) => [
        r.name,
        r.ownerEmail,
        r.phone,
        PLANS[r.plan as keyof typeof PLANS]?.label ?? r.plan,
        STATE_LABELS[companyState(r, now)],
        day(r.nextPaymentDueDate),
        r.monthlyFeeUsdCents != null ? money(r.monthlyFeeUsdCents) : "",
        r.usersActive,
        r.productCount,
        r.lastPayment ? money(r.lastPayment.amountUsdCents) : "",
        day(r.lastPayment?.createdAt),
        day(r.lastActivityAt),
        day(r.createdAt),
        r.crmTags.join(" | "),
      ])
    );
  } else if (kind === "pagos") {
    const reports = await withSuperAdmin((tx) =>
      tx.paymentReport.findMany({
        orderBy: { createdAt: "desc" },
        take: 5000,
        select: { createdAt: true, status: true, note: true, reporterName: true, company: { select: { name: true } }, lines: { select: { paymentMethod: true, amountUsdCents: true, reference: true } } },
      })
    );
    const label = { PENDING: "Pendiente", APPROVED: "Aprobado", REJECTED: "Rechazado" } as const;
    csv = toCsv(
      ["Fecha", "Empresa", "Estado", "Método", "Monto USD", "Referencia", "Reportó", "Nota"],
      reports.flatMap((r) =>
        r.lines.map((l) => [day(r.createdAt), r.company.name, label[r.status], PAYMENT_METHOD_LABELS[l.paymentMethod], money(l.amountUsdCents), l.reference, r.reporterName, r.note])
      )
    );
  } else if (kind === "canjes") {
    const rows = await listCouponRedemptions();
    csv = toCsv(["Fecha", "Cupón", "Empresa", "Descuento USD", "Estado"], rows.map((r) => [day(r.createdAt), r.code, r.companyName, money(r.discountUsdCents), r.confirmed ? "Confirmado" : "Reservado"]));
  } else if (kind === "auditoria") {
    const rows = await listAuditLog({ action: p.get("action") ?? undefined, q: p.get("q") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined }, 5000);
    csv = toCsv(
      ["Fecha", "Quién", "Acción", "Empresa", "Detalle"],
      rows.map((r) => [r.createdAt, r.actorEmail, AUDIT_ACTIONS[r.action as keyof typeof AUDIT_ACTIONS] ?? r.action, r.companyName, r.detail])
    );
  } else {
    return NextResponse.json({ error: "Exportación desconocida" }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kr-plataforma-${kind}-${now.toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

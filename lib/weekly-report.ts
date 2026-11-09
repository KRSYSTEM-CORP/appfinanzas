import "server-only";
import { withSuperAdmin } from "@/lib/tenant-db";
import { dayBoundsUtc, todayDateString } from "@/lib/report-types";
import { sendWeeklyReportEmail } from "@/lib/email";
import { formatCurrencyCents } from "@/lib/currencies";

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Envía el reporte de la semana en curso (lunes a domingo, hora de Venezuela) a los
// gerentes de cada empresa que lo activó. Lo dispara el cron diario los domingos.
// Un fallo en una empresa no frena a las demás.
export async function sendWeeklyReports(): Promise<{ companies: number; sent: number }> {
  const today = todayDateString();
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const start = dayBoundsUtc(monday).start;
  const end = dayBoundsUtc(addDays(monday, 6)).end;
  const label = `${monday} al ${addDays(monday, 6)}`;

  return withSuperAdmin(async (tx) => {
    const companies = await tx.company.findMany({
      where: { weeklyReportEnabled: true },
      select: { id: true, name: true, referenceCurrency: true },
    });
    let sent = 0;
    for (const c of companies) {
      try {
        const [agg, top, managers] = await Promise.all([
          tx.sale.aggregate({ _sum: { totalCents: true }, _count: true, where: { companyId: c.id, voided: false, createdAt: { gte: start, lt: end } } }),
          tx.$queryRaw<{ name: string; qty: bigint }[]>`
            SELECT si."productName" AS name, SUM(si."quantity")::bigint AS qty
            FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
            WHERE s."companyId" = ${c.id} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
            GROUP BY si."productName" ORDER BY SUM(si."quantity") DESC LIMIT 3`,
          tx.user.findMany({ where: { companyId: c.id, role: "GERENTE", status: "ACTIVE" }, select: { email: true } }),
        ]);
        const body = `
          <h2>Tu semana en ${esc(c.name)}</h2>
          <p>Semana del ${label}</p>
          <p style="font-size: 28px; font-weight: 700; margin: 12px 0;">${formatCurrencyCents(c.referenceCurrency, agg._sum.totalCents ?? 0)}</p>
          <p>${agg._count} ${agg._count === 1 ? "pedido" : "pedidos"}</p>
          ${top.length ? `<p><strong>Lo más vendido:</strong></p><ul>${top.map((t) => `<li>${esc(t.name)} — ${Number(t.qty)} und.</li>`).join("")}</ul>` : ""}
          <p>Abre Estadísticas en KR POS para ver el detalle. Puedes desactivar este correo en Estadísticas → Reporte semanal.</p>`;
        for (const m of managers) {
          if (m.email && (await sendWeeklyReportEmail(m.email, `Tu reporte semanal — ${c.name}`, body))) sent++;
        }
      } catch (err) {
        console.error(`[weekly-report] company ${c.id} failed:`, err);
      }
    }
    return { companies: companies.length, sent };
  });
}

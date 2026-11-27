import "server-only";
import { withSuperAdmin } from "@/lib/tenant-db";
import { dayBoundsUtc, todayDateString } from "@/lib/report-types";
import { sendWeeklyReportEmail } from "@/lib/email";
import { formatCurrencyCents } from "@/lib/currencies";

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Cuerpo del reporte de ventas de un día para una empresa (se usa también en «Enviar prueba»).
export async function buildDailyReport(companyId: string): Promise<{ subject: string; body: string; emails: string[] } | null> {
  const day = todayDateString();
  const { start, end } = dayBoundsUtc(day);
  return withSuperAdmin(async (tx) => {
    const c = await tx.company.findUnique({
      where: { id: companyId },
      select: { name: true, referenceCurrency: true, dailyReportEmails: true },
    });
    if (!c) return null;
    const [agg, top] = await Promise.all([
      tx.sale.aggregate({ _sum: { totalCents: true }, _count: true, where: { companyId, voided: false, createdAt: { gte: start, lt: end } } }),
      tx.$queryRaw<{ name: string; qty: bigint }[]>`
        SELECT si."productName" AS name, SUM(si."quantity")::float8 AS qty
        FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
        WHERE s."companyId" = ${companyId} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
        GROUP BY si."productName" ORDER BY SUM(si."quantity") DESC LIMIT 3`,
    ]);
    const byCur = await tx.$queryRaw<{ cur: string; cents: bigint }[]>`
      SELECT COALESCE(sp."currencyCode", CASE WHEN sp."paymentMethod"::text IN ('ZELLE','BINANCE','PAYPAL') THEN 'USD' ELSE ${c.referenceCurrency} END) AS cur,
             SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents
      FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId"
      WHERE s."companyId" = ${companyId} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1 ORDER BY 2 DESC`;
    const cobrado = byCur.length ? `<p><strong>Cobrado por moneda:</strong> ${byCur.map((r) => esc(formatCurrencyCents(r.cur, Number(r.cents)))).join(" + ")}</p>` : "";
    const body = `
      <h2>Ventas de hoy en ${esc(c.name)}</h2>
      <p>${day}</p>
      <p style="font-size: 28px; font-weight: 700; margin: 12px 0;">${formatCurrencyCents(c.referenceCurrency, agg._sum.totalCents ?? 0)}</p>
      <p style="color:#555;font-size:12px;margin:0">Valor vendido (referencia a la tasa BCV)</p>
      <p>${agg._count} ${agg._count === 1 ? "venta" : "ventas"}</p>
      ${cobrado}
      ${top.length ? `<p><strong>Lo más vendido:</strong></p><ul>${top.map((t) => `<li>${esc(t.name)} — ${Number(t.qty)} und.</li>`).join("")}</ul>` : ""}
      <p>Puedes cambiar los destinatarios en Ajustes → Impresión y Datos.</p>`;
    return { subject: `Ventas de hoy — ${c.name}`, body, emails: c.dailyReportEmails };
  });
}

// Lo dispara el cron diario: un correo por empresa a sus destinatarios configurados.
export async function sendDailyReports(): Promise<{ companies: number; sent: number }> {
  const ids = await withSuperAdmin((tx) =>
    tx.company.findMany({ where: { NOT: { dailyReportEmails: { isEmpty: true } } }, select: { id: true } })
  );
  let sent = 0;
  for (const { id } of ids) {
    try {
      const r = await buildDailyReport(id);
      if (!r) continue;
      for (const to of r.emails) if (await sendWeeklyReportEmail(to, r.subject, r.body)) sent++;
    } catch (err) {
      console.error(`[daily-report] company ${id} failed:`, err);
    }
  }
  return { companies: ids.length, sent };
}

import { NextResponse } from "next/server";
import { withSuperAdmin } from "@/lib/tenant-db";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { verifyPaymentReportToken } from "@/lib/payment-link";
import { buildPaymentPDF } from "@/lib/payment-pdf";
import { PAYMENT_METHOD_LABEL, paymentConcept, paymentShortCode } from "@/lib/payment-share";

// PDF público de un pago reportado, para que soporte lo abra desde el enlace del mensaje de WhatsApp o
// del correo. A diferencia de las cotizaciones, además del id lleva una firma HMAC (?t=) porque incluye
// datos de contacto y el comprobante; sin firma válida responde 404 como si no existiera.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("public-payment-pdf", ip, 30, 60_000);
  if (!rl.allowed) return new NextResponse("Demasiadas solicitudes, intenta de nuevo en un momento", { status: 429 });
  await recordFailedAttempt("public-payment-pdf", ip);

  const { id } = await params;
  const token = new URL(request.url).searchParams.get("t");
  if (!verifyPaymentReportToken(id, token)) {
    return new NextResponse("Documento no encontrado", { status: 404 });
  }

  const report = await withSuperAdmin((tx) =>
    tx.paymentReport.findUnique({
      where: { id },
      include: { lines: true, company: { select: { name: true, loginCode: true } } },
    })
  );
  if (!report) return new NextResponse("Documento no encontrado", { status: 404 });

  const total = report.lines.reduce((s, l) => s + l.amountUsdCents, 0);
  const first = report.lines[0];
  const doc = buildPaymentPDF({
    code: paymentShortCode(report.id),
    companyName: report.company.name,
    companyCode: report.company.loginCode,
    concept: paymentConcept(report.note, report.isLifetime),
    amountUsdCents: total,
    methodLabel: first ? (PAYMENT_METHOD_LABEL[first.paymentMethod] ?? first.paymentMethod) : "—",
    reference: report.lines.map((l) => l.reference).filter(Boolean).join(", ") || null,
    reportedAt: report.createdAt,
    status: report.status,
    reporterName: report.reporterName,
    reporterPhone: report.reporterPhone,
    reporterEmail: report.reporterEmail,
    proofImageDataUrl: report.proofImageDataUrl,
  });

  const pdfBytes = doc.output("arraybuffer");
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="pago-${paymentShortCode(report.id)}.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

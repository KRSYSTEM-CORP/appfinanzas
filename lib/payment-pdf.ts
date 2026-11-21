import { jsPDF } from "jspdf";

export type PaymentPdfData = {
  code: string;
  companyName: string;
  companyCode: string | null;
  concept: string;
  amountUsdCents: number;
  methodLabel: string;
  reference: string | null;
  reportedAt: Date;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reporterName: string | null;
  reporterPhone: string | null;
  reporterEmail: string | null;
  proofImageDataUrl: string | null;
};

const STATUS_LABEL = { PENDING: "Pendiente de revisión", APPROVED: "Aprobado", REJECTED: "Rechazado" } as const;

function usd(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// PDF de un pago reportado: todo lo que soporte necesita para verificarlo, más el comprobante.
export function buildPaymentPDF(d: PaymentPdfData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  doc.setFillColor(67, 61, 221);
  doc.rect(0, 0, W, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("KR POS", M, 34);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("Comprobante de pago reportado", M, 54);
  doc.setFontSize(10);
  doc.text(`Código ${d.code}`, W - M, 40, { align: "right" });

  doc.setTextColor(20, 20, 30);
  const rows: [string, string][] = [
    ["Empresa", d.companyName],
    ...(d.companyCode ? ([["Código de acceso", d.companyCode]] as [string, string][]) : []),
    ["Concepto", d.concept],
    ["Monto", usd(d.amountUsdCents)],
    ["Método de pago", d.methodLabel],
    ["Referencia", d.reference?.trim() || "—"],
    ["Fecha del reporte", d.reportedAt.toLocaleString("es-VE", { dateStyle: "long", timeStyle: "short", timeZone: "America/Caracas" })],
    ["Estado", STATUS_LABEL[d.status]],
    ["Reportado por", d.reporterName || "—"],
    ["Teléfono", d.reporterPhone || "—"],
    ["Correo", d.reporterEmail || "—"],
  ];
  let y = 108;
  for (const [k, v] of rows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 125);
    doc.text(k.toUpperCase(), M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 30);
    const lines = doc.splitTextToSize(v, W - M * 2 - 150) as string[];
    doc.text(lines, M + 150, y);
    y += Math.max(20, lines.length * 15 + 5);
  }

  y += 6;
  doc.setDrawColor(225, 225, 235);
  doc.line(M, y, W - M, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Comprobante", M, y);
  y += 10;

  const proof = d.proofImageDataUrl?.match(/^data:image\/(png|jpe?g|webp);base64,/);
  if (d.proofImageDataUrl && proof) {
    try {
      const fmt = proof[1] === "png" ? "PNG" : proof[1] === "webp" ? "WEBP" : "JPEG";
      const props = doc.getImageProperties(d.proofImageDataUrl);
      const maxW = W - M * 2;
      const maxH = H - y - 60;
      const scale = Math.min(maxW / props.width, maxH / props.height, 1);
      const w = props.width * scale;
      const h = props.height * scale;
      doc.addImage(d.proofImageDataUrl, fmt, M, y, w, h);
    } catch {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("No se pudo incluir la imagen del comprobante en este PDF.", M, y + 14);
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("Sin imagen de comprobante.", M, y + 14);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 155);
  doc.text("Generado por KR POS · krsystem-corp.com · Verificar y aprobar desde el panel de administración.", M, H - 28);
  return doc;
}

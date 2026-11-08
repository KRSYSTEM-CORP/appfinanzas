import { jsPDF } from "jspdf";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import { formatCurrencyCents } from "@/lib/currencies";
import { periodLabel } from "@/lib/payroll";
import { renderCompanyHeader, renderDocumentTitleBlock, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PaymentMethod, ReferenceCurrency } from "@prisma/client";

export type PayrollReceiptData = {
  employeeName: string;
  nationalId: string | null;
  position: string | null;
  period: string;
  grossCents: number;
  commissionCents?: number;
  deductionsCents: number;
  advanceCents: number;
  netCents: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  paidAt: Date;
};

// Recibo de pago de nómina (una quincena) para que el empleado firme.
export async function buildPayrollReceiptPDF(
  data: PayrollReceiptData,
  company: DeliveryNoteCompany,
  referenceCurrency: ReferenceCurrency,
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const y0 = 40;
  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y0, pageWidth);
  const titleBottomY = renderDocumentTitleBlock(
    doc,
    "RECIBO DE PAGO DE NÓMINA",
    [`Fecha: ${formatDate(data.paidAt)}`, periodLabel(data.period)],
    margin,
    y0,
    pageWidth
  );
  let y = Math.max(titleBottomY + 20, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(11);
    doc.text(label, margin, y);
    doc.text(value, pageWidth - margin, y, { align: "right" });
    y += 20;
  };

  row("Empleado", data.employeeName, true);
  if (data.nationalId) row("Cédula", data.nationalId);
  if (data.position) row("Cargo", data.position);
  y += 8;
  doc.line(margin, y - 8, pageWidth - margin, y - 8);
  row("Asignaciones (sueldo, bono y comisión de la quincena)", money(data.grossCents));
  if ((data.commissionCents ?? 0) > 0) row("   de las cuales, comisión por ventas", money(data.commissionCents ?? 0));
  row("Deducciones de ley", `−${money(data.deductionsCents)}`);
  if (data.advanceCents > 0) row("Adelanto descontado", `−${money(data.advanceCents)}`);
  y += 4;
  doc.line(margin, y - 8, pageWidth - margin, y - 8);
  row("NETO PAGADO", money(data.netCents), true);
  y += 8;
  row("Método de pago", PAYMENT_METHOD_LABELS[data.paymentMethod]);
  if (data.reference) row("Referencia", data.reference);

  y += 60;
  doc.line(margin, y, margin + 200, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Recibí conforme · ${data.employeeName}`, margin, y);
  return doc;
}

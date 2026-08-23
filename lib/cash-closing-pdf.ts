import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PAYMENT_METHOD_LABELS, formatDate, formatDateOnly } from "@/lib/format";
import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency, referenceNote } from "@/lib/currencies";
import { renderCompanyHeader, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";
import type { ReferenceCurrency } from "@prisma/client";

export async function buildCashClosingPDF(
  summary: CashClosingSummary,
  company: DeliveryNoteCompany,
  branchName: string | null,
  rate: number | null,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled: boolean = true,
  referenceCurrency: ReferenceCurrency = "EUR",
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;
  const showLocal = exchangeRateEnabled && rate != null;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CIERRE DE CAJA", pageWidth / 2, y + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Fecha: ${formatDateOnly(summary.date)}`, pageWidth - margin, y + 5, { align: "right" });
  if (branchName) {
    doc.text(`Sucursal: ${branchName}`, pageWidth - margin, y + 20, { align: "right" });
  }

  y = Math.max(y + 70, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  if (summary.closed) {
    doc.setTextColor(20, 120, 60);
    doc.text(`CERRADA — ${formatDate(summary.closed.closedAt)}`, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 16;
    if (summary.closed.note) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const noteLines = doc.splitTextToSize(`Nota: ${summary.closed.note}`, pageWidth - margin * 2) as string[];
      doc.text(noteLines, margin, y);
      y += noteLines.length * 12;
    }
  } else {
    doc.setTextColor(180, 30, 30);
    doc.text("CAJA ABIERTA — todavía no se ha cerrado este día", margin, y);
    doc.setTextColor(0, 0, 0);
    y += 16;
  }
  y += 16;

  const money = (cents: number) => {
    const local = showLocal ? formatLocalCurrency(eurCentsToLocal(cents, rate!), currencyCode) : null;
    const reference = formatCurrencyCents(referenceCurrency, cents);
    return local ? `${local} (${reference})` : reference;
  };

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Total vendido:", margin, y);
  doc.setFont("helvetica", "bold");
  doc.text(money(summary.totalCents), pageWidth - margin, y, { align: "right" });
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.text("Número de ventas:", margin, y);
  doc.text(String(summary.salesCount), pageWidth - margin, y, { align: "right" });
  y += 26;

  if (summary.byMethod.length > 0) {
    const rows = summary.byMethod.map((m) => [PAYMENT_METHOD_LABELS[m.paymentMethod], money(m.totalCents)]);
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Método de pago", "Total"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 10, cellPadding: 6 },
      columnStyles: { 1: { halign: "right" } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text("No hubo ventas registradas este día.", margin, y);
    doc.setTextColor(0, 0, 0);
    y += 20;
  }

  if (exchangeRateEnabled && rate != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(referenceNote(currencyCode, referenceCurrency), margin, y);
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}

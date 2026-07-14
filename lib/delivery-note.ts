import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { PAYMENT_METHOD_LABELS, eurCentsToVES, formatDate, formatEUR, formatVES } from "@/lib/format";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

const COPYRIGHT_LINE =
  '© 2026 KYRA SOFTWARE. Todos los derechos reservados. Empresa de Sistemas Automatizados "KYRA SOFTWARE" Teléfono: 0424-4017900.';

export type DeliveryNoteSale = {
  id: string;
  controlNumber: number | null;
  createdAt: Date;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paymentReference: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  items: { productName: string; quantity: number; unitPriceCents: number; subtotalCents: number }[];
};

export type DeliveryNoteCompany = {
  name: string;
  logoDataUrl: string | null;
};

function dataUrlImageFormat(dataUrl: string): "PNG" | "JPEG" {
  return dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
}

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("No se pudo cargar el logo"));
    img.src = dataUrl;
  });
}

export function controlNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "controlNumber">): string {
  return sale.controlNumber != null
    ? String(sale.controlNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

export async function buildDeliveryNotePDF(
  sale: DeliveryNoteSale,
  company: DeliveryNoteCompany,
  rate: number | null
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 40;

  let logoWidth = 0;
  if (company.logoDataUrl) {
    try {
      const { width, height } = await loadImageSize(company.logoDataUrl);
      const maxBox = 50;
      const scale = Math.min(1, maxBox / Math.max(width, height));
      logoWidth = width * scale;
      const logoHeight = height * scale;
      doc.addImage(company.logoDataUrl, dataUrlImageFormat(company.logoDataUrl), margin, y, logoWidth, logoHeight);
    } catch {
      logoWidth = 0;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(company.name, margin + (logoWidth > 0 ? logoWidth + 12 : 0), y + 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("NOTA DE ENTREGA", pageWidth / 2, y + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Nº de control: ${controlNumberLabel(sale)}`, pageWidth - margin, y + 5, { align: "right" });
  doc.text(`Fecha: ${formatDate(sale.createdAt)}`, pageWidth - margin, y + 20, { align: "right" });

  y += 70;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const customerName = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim();
  const infoLines: [string, string][] = [["Cliente:", customerName || "—"]];
  if (sale.customerPhone) infoLines.push(["Teléfono:", sale.customerPhone]);
  if (sale.customerAddress) infoLines.push(["Dirección:", sale.customerAddress]);

  for (const [label, value] of infoLines) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 60, y, { maxWidth: pageWidth - margin * 2 - 60 });
    y += 16;
  }
  y += 10;

  const rows = sale.items.map((item) => [
    String(item.quantity),
    item.productName,
    rate != null ? formatVES(eurCentsToVES(item.unitPriceCents, rate)) : formatEUR(item.unitPriceCents),
    rate != null ? formatVES(eurCentsToVES(item.subtotalCents, rate)) : formatEUR(item.subtotalCents),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Cant.", "Descripción", "Precio unit.", "Subtotal"]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      0: { cellWidth: 40, halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Tasa del día: ${rate != null ? `${formatVES(rate)} por 1€` : "No disponible"}`, margin, y);
  y += 18;

  if (sale.paymentStatus === "CREDIT") {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 30, 30);
    doc.setFontSize(12);
    doc.text("PAGO PENDIENTE", margin, y);
    doc.setTextColor(0, 0, 0);
  } else {
    doc.text(
      `Método de pago: ${sale.paymentMethod ? PAYMENT_METHOD_LABELS[sale.paymentMethod] : "—"}`,
      margin,
      y
    );
    if (sale.paymentReference) {
      y += 16;
      doc.text(`Referencia: ${sale.paymentReference}`, margin, y);
    }
  }
  y += 26;

  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const totalVES = rate != null ? formatVES(eurCentsToVES(sale.totalCents, rate)) : null;
  const totalEUR = formatEUR(sale.totalCents);
  const totalLabel = totalVES ? `${totalVES} (${totalEUR})` : totalEUR;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Subtotal:", margin, y);
  doc.text(totalLabel, pageWidth - margin, y, { align: "right" });
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL A CANCELAR:", margin, y);
  doc.text(totalLabel, pageWidth - margin, y, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(110);
  doc.text(COPYRIGHT_LINE, pageWidth / 2, pageHeight - 30, { align: "center" });

  return doc;
}

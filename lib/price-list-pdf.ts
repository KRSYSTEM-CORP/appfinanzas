import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";
import { formatCurrencyCents } from "@/lib/currencies";
import { renderCompanyHeader, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ReferenceCurrency } from "@prisma/client";

export type PriceListProduct = {
  name: string;
  category: string | null;
  priceCents: number;
};

export async function buildPriceListPDF(
  products: PriceListProduct[],
  company: DeliveryNoteCompany,
  referenceCurrency: ReferenceCurrency,
  format: "letter" | "a4" = "letter"
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("LISTA DE PRECIOS", pageWidth / 2, y + 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${formatDate(new Date())}`, pageWidth - margin, y + 5, { align: "right" });

  y = Math.max(y + 50, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const rows = products.map((p) => [
    p.category ? `${p.name} (${p.category})` : p.name,
    formatCurrencyCents(referenceCurrency, p.priceCents),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Producto", `Precio (${referenceCurrency})`]],
    body: rows,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 9, cellPadding: 6 },
    columnStyles: {
      1: { halign: "right", cellWidth: 100 },
    },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = Math.max(y, pageHeight - 60);
  const bcvLabel = referenceCurrency === "USD" ? "Dólar BCV" : "Euro BCV";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  const footerLines = doc.splitTextToSize(
    `Lista de precios sujeta a cambio según la tasa diaria del BCV. Precios cotizados en ${bcvLabel}.`,
    pageWidth - margin * 2
  ) as string[];
  doc.text(footerLines, pageWidth / 2, footerY, { align: "center" });
  doc.setTextColor(0, 0, 0);

  return doc;
}

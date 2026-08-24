import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";
import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency, referenceNote } from "@/lib/currencies";
import {
  itemDescription,
  renderCompanyHeader,
  renderDocumentTitleBlock,
  renderNote,
  type DeliveryNoteCompany,
} from "@/lib/delivery-note";
import type { ReferenceCurrency } from "@prisma/client";

export type QuoteForPdf = {
  id: string;
  controlNumber: number | null;
  createdAt: Date;
  totalCents: number;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  sellerName?: string | null;
  note?: string | null;
  items: {
    productName: string;
    category?: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
};

export function quoteControlNumberLabel(quote: Pick<QuoteForPdf, "id" | "controlNumber">): string {
  return quote.controlNumber != null
    ? String(quote.controlNumber).padStart(6, "0")
    : quote.id.slice(-8).toUpperCase();
}

export async function buildQuotePDF(
  quote: QuoteForPdf,
  company: DeliveryNoteCompany,
  rate: number | null,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled: boolean = true,
  referenceCurrency: ReferenceCurrency = "EUR",
  format: "letter" | "a4" = "letter",
  useLocalCurrency: boolean = true
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 40;
  const showLocal = useLocalCurrency && exchangeRateEnabled && rate != null;

  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y, pageWidth);

  const titleBottomY = renderDocumentTitleBlock(
    doc,
    "PRESUPUESTO",
    [`Nº de control: ${quoteControlNumberLabel(quote)}`, `Fecha: ${formatDate(quote.createdAt)}`],
    margin,
    y,
    pageWidth
  );

  y = Math.max(titleBottomY + 20, fiscalEndY + 20);
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const customerName = `${quote.customerFirstName ?? ""} ${quote.customerLastName ?? ""}`.trim();
  const infoLines: [string, string][] = [["Cliente:", customerName || "—"]];
  if (quote.customerPhone) infoLines.push(["Teléfono:", quote.customerPhone]);
  if (quote.customerAddress) infoLines.push(["Dirección:", quote.customerAddress]);
  if (quote.sellerName) infoLines.push(["Vendedor:", quote.sellerName]);

  for (const [label, value] of infoLines) {
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, margin + 60, y, { maxWidth: pageWidth - margin * 2 - 60 });
    y += 16;
  }
  y += 10;
  y = renderNote(doc, quote.note, margin, y, pageWidth);

  const rows = quote.items.map((item) => [
    String(item.quantity),
    itemDescription(item),
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(item.unitPriceCents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, item.unitPriceCents),
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(item.subtotalCents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, item.subtotalCents),
  ]);

  const unitPriceHeader = showLocal ? `Precio unit. (${currencyCode})` : `Precio unit. (${referenceCurrency})`;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Cant.", "Descripción", unitPriceHeader, "Subtotal"]],
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

  if (showLocal) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Tasa del día: ${formatLocalCurrency(rate!, currencyCode)} por 1${referenceCurrency === "USD" ? "$" : "€"}`,
      margin,
      y
    );
    y += 14;
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(referenceNote(currencyCode, referenceCurrency), margin, y);
    doc.setTextColor(0, 0, 0);
    y += 22;
  } else {
    y += 8;
  }

  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const totalLabel = showLocal
    ? formatLocalCurrency(eurCentsToLocal(quote.totalCents, rate!), currencyCode)
    : formatCurrencyCents(referenceCurrency, quote.totalCents);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Subtotal:", margin, y);
  doc.text(totalLabel, pageWidth - margin, y, { align: "right" });
  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL ESTIMADO:", margin, y);
  doc.text(totalLabel, pageWidth - margin, y, { align: "right" });

  return doc;
}

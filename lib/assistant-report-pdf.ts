import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";
import { renderCompanyHeader, renderDocumentTitleBlock, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ResolvedTable } from "@/lib/assistant-types";

// PDF de cualquier tabla que muestre el Asistente: encabezado de la empresa, título, período,
// la tabla y el total. Se arma en el navegador con los datos reales ya consultados.
export async function buildAssistantReportPDF(table: ResolvedTable, company: DeliveryNoteCompany, format: "letter" | "a4" = "letter"): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const y0 = 40;
  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y0, pageWidth);
  const titleBottomY = renderDocumentTitleBlock(doc, table.title.toUpperCase(), [table.subtitle, `Emitido: ${formatDate(new Date())}`], margin, y0, pageWidth);
  const startY = Math.max(titleBottomY + 20, fiscalEndY + 20);
  const lastCol = table.columns.length - 1;
  autoTable(doc, {
    startY,
    head: [table.columns],
    body: table.rows.length ? table.rows : [["Sin datos en este período", ...table.columns.slice(1).map(() => "")]],
    foot: table.totals ? [table.totals] : undefined,
    margin: { left: margin, right: margin },
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [67, 61, 221] },
    footStyles: { fillColor: [238, 238, 250], textColor: 20, fontStyle: "bold" },
    columnStyles: { [lastCol]: { halign: "right" } },
  });
  return doc;
}

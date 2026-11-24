import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/format";
import { renderCompanyHeader, renderDocumentTitleBlock, type DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ReportSection, ResolvedTable } from "@/lib/assistant-types";

// Texto negro y encabezados en gris claro: el PDF también se imprime (blanco y negro).
const INK = 0;
const HEAD_FILL: [number, number, number] = [225, 225, 225];
const FOOT_FILL: [number, number, number] = [240, 240, 240];
const LINE: [number, number, number] = [120, 120, 120];

function tableStyles() {
  return {
    styles: { fontSize: 8.5, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4, overflow: "linebreak" as const },
    headStyles: { fillColor: HEAD_FILL, textColor: INK, fontStyle: "bold" as const, lineColor: LINE, lineWidth: 0.4 },
    footStyles: { fillColor: FOOT_FILL, textColor: INK, fontStyle: "bold" as const },
    // El encabezado se repite en cada página y una fila nunca se parte a la mitad.
    showHead: "everyPage" as const,
    rowPageBreak: "avoid" as const,
  };
}

function alignRight(cols: number) {
  const out: Record<number, { halign: "right" }> = {};
  for (let i = 1; i < cols; i++) out[i] = { halign: "right" };
  return out;
}

// PDF de cualquier tabla que muestre el Asistente. Con `table.report` sale el reporte completo:
// portada con resumen ejecutivo, secciones numeradas, notas y pie con fecha de emisión y paginación.
export async function buildAssistantReportPDF(table: ResolvedTable, company: DeliveryNoteCompany, format: "letter" | "a4" = "letter"): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const y0 = 40;
  const emitted = `Emitido: ${formatDate(new Date())}`;
  doc.setTextColor(INK);
  const fiscalEndY = await renderCompanyHeader(doc, company, margin, y0, pageWidth, table.report ? undefined : table.title.toUpperCase());
  // El reporte completo lleva el título debajo del encabezado de la empresa (no se montan los textos).
  const titleY = table.report ? fiscalEndY + 6 : y0;
  const titleBottomY = renderDocumentTitleBlock(doc, table.title.toUpperCase(), [table.subtitle, emitted], margin, titleY, pageWidth);
  let y = Math.max(titleBottomY + 20, fiscalEndY + 20);
  const ts = tableStyles();
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  if (!table.report) {
    const lastCol = table.columns.length - 1;
    autoTable(doc, {
      startY: y,
      head: [table.columns],
      body: table.rows.length ? table.rows : [["Sin datos en este período", ...table.columns.slice(1).map(() => "")]],
      foot: table.totals ? [table.totals] : undefined,
      margin: { left: margin, right: margin, bottom: 50 },
      ...ts,
      columnStyles: { [lastCol]: { halign: "right" } },
    });
  } else {
    const { kpis, sections, notes } = table.report;
    // Resumen ejecutivo: tarjetas en 3 columnas.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Resumen ejecutivo", margin, y);
    y += 8;
    const per = 3;
    const grid: string[][] = [];
    for (let i = 0; i < kpis.length; i += per) {
      grid.push(Array.from({ length: per }, (_, j) => {
        const k = kpis[i + j];
        return k ? `${k.label}\n${k.value}${k.hint ? `\n${k.hint}` : ""}` : "";
      }));
    }
    autoTable(doc, {
      startY: y,
      body: grid,
      theme: "grid",
      margin: { left: margin, right: margin, bottom: 50 },
      styles: { fontSize: 8.5, cellPadding: 6, textColor: INK, lineColor: LINE, lineWidth: 0.5, valign: "top", minCellHeight: 46 },
      rowPageBreak: "avoid",
      didParseCell: (d) => {
        if (d.section === "body" && typeof d.cell.raw === "string") d.cell.styles.fontStyle = "normal";
      },
    });
    y = lastY() + 22;

    const renderSection = (s: ReportSection) => {
      // Un título nunca queda solo al final de la página.
      if (y > pageHeight - 150) {
        doc.addPage();
        y = margin + 28;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(INK);
      doc.text(s.title, margin, y);
      y += 6;
      if (s.note) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        const lines = doc.splitTextToSize(s.note, pageWidth - margin * 2) as string[];
        doc.text(lines, margin, y + 8);
        y += 8 + lines.length * 10;
      }
      autoTable(doc, {
        startY: y + 2,
        head: [s.columns],
        body: s.rows.length ? s.rows : [["Sin datos en este período", ...s.columns.slice(1).map(() => "")]],
        foot: s.totals ? [s.totals] : undefined,
        margin: { left: margin, right: margin, bottom: 50, top: margin + 28 },
        ...ts,
        showFoot: "lastPage",
        columnStyles: alignRight(s.columns.length),
      });
      y = lastY() + 20;
    };
    sections.forEach(renderSection);

    if (y > pageHeight - 140) {
      doc.addPage();
      y = margin + 28;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Notas y aclaraciones", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    let ny = y + 14;
    for (const note of notes) {
      const lines = doc.splitTextToSize(`• ${note}`, pageWidth - margin * 2) as string[];
      if (ny + lines.length * 10 > pageHeight - 50) {
        doc.addPage();
        ny = margin + 28;
      }
      doc.text(lines, margin, ny);
      ny += lines.length * 10 + 4;
    }
  }

  // Encabezado repetido (desde la página 2) y pie con emisión y paginación en todas.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setTextColor(INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    if (p > 1) {
      doc.text(`${company.name} · ${table.title}`, margin, 28);
      doc.text(table.subtitle, pageWidth - margin, 28, { align: "right" });
      doc.setDrawColor(INK);
      doc.setLineWidth(0.5);
      doc.line(margin, 34, pageWidth - margin, 34);
    }
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 36, pageWidth - margin, pageHeight - 36);
    doc.text(`${emitted} · KR POS`, margin, pageHeight - 24);
    doc.text(`Página ${p} de ${total}`, pageWidth - margin, pageHeight - 24, { align: "right" });
  }
  return doc;
}

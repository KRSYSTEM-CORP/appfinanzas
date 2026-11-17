import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildAssistantReportPDF } from "@/lib/assistant-report-pdf";
import { formatCurrencyCents } from "@/lib/currencies";
import type { ResolvedTable } from "@/lib/assistant-types";

const refEur = (c: number) => formatCurrencyCents("EUR", c);
const bs = (c: number) => formatCurrencyCents("VES", c);
const usd = (c: number) => formatCurrencyCents("USD", c);

function sample(days: number): ResolvedTable {
  const rows = Array.from({ length: days }, (_, i) => [`${String(i + 1).padStart(2, "0")} nov`, String(3 + (i % 4)), bs(487500 + i * 1000), usd(5000 + i * 100), refEur(10000 + i * 50)]);
  return {
    type: "table",
    dataset: "reporte_completo",
    title: "Reporte completo de ventas",
    subtitle: "01 nov al 16 nov · cobrado por moneda",
    columns: ["Fecha", "Ventas", "Cobrado Bs", "Cobrado USD", "Vendido (ref.)"],
    rows,
    from: "2026-11-01",
    to: "2026-11-16",
    report: {
      kpis: [
        { label: "Ventas realizadas", value: "52" },
        { label: "Cobrado en Bs", value: bs(25000000), hint: "2.564,10 € de referencia" },
        { label: "Cobrado en USD", value: usd(180000) },
        { label: "Valor vendido (referencia)", value: refEur(430000), hint: "A la tasa BCV; solo referencia" },
      ],
      sections: [
        { title: "1. Cobrado por moneda", columns: ["Moneda", "Pagos", "Monto cobrado", "Equiv. ref. (EUR)"], rows: [["Bolívares (VES)", "30", bs(25000000), refEur(256410)], ["USD", "22", usd(180000), refEur(180000)]], totals: ["Consolidado (referencia)", "", "", refEur(436410)] },
        { title: "3. Detalle por día", note: "Ventas y valor vendido por fecha de la venta; cobrado por fecha en que se recibió cada pago.", columns: ["Fecha", "Ventas", "Cobrado Bs", "Cobrado USD", "Vendido (ref.)"], rows, totals: ["Total", "52", bs(25000000), usd(180000), refEur(430000)] },
        { title: "7. Cobrado por vendedor / cajero", columns: ["Vendedor", "Cant.", "Cobrado en Bs", "Cobrado en USD", "Equiv. ref. (EUR)"], rows: [["Ana", "10", bs(390000), usd(2500), refEur(6500)]] },
      ],
      notes: ["Cada cobro se muestra en la moneda real en que se recibió.", "Las columnas «ref.» son conversiones de referencia a la tasa BCV."],
    },
  };
}

describe("PDF del reporte completo del Asistente", () => {
  it("arma varias páginas, con tablas que repiten encabezado y montos en su moneda", async () => {
    const doc = await buildAssistantReportPDF(sample(60), { name: "Comercial Pruebas", logoDataUrl: null, fiscalRif: "J-12345678-9" });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const out = doc.output("arraybuffer");
    if (process.env.REPORT_PDF_OUT) writeFileSync(process.env.REPORT_PDF_OUT, Buffer.from(out));
    expect(out.byteLength).toBeGreaterThan(5000);
  });

  it("una tabla simple sigue funcionando", async () => {
    const t = { ...sample(3), report: undefined };
    const doc = await buildAssistantReportPDF(t, { name: "X", logoDataUrl: null });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

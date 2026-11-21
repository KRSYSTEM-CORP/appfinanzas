import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildPaymentMessage,
  paymentConcept,
  paymentShortCode,
  whatsappPaymentUrl,
  type PaymentShareInfo,
} from "@/lib/payment-share";
import { buildPaymentPDF } from "@/lib/payment-pdf";

const info: PaymentShareInfo = {
  code: "ABCD1234",
  companyName: "Negocio de Prueba",
  concept: "Suscripción — Plan Pyme",
  amountUsdCents: 2399,
  methodLabel: "Pago Móvil",
  reference: "00123456",
  reportedAt: new Date("2026-11-21T15:30:00Z"),
  reporterName: "Ana Pérez",
  reporterPhone: "0414-1234567",
  pdfUrl: "https://krpos.krsystem-corp.com/api/public/pagos/abc?t=xyz",
};

describe("mensaje de pago", () => {
  it("lleva todos los datos que soporte necesita y el enlace al PDF", () => {
    const t = buildPaymentMessage(info);
    for (const s of ["Negocio de Prueba", "Suscripción — Plan Pyme", "$23,99", "Pago Móvil", "00123456", "Ana Pérez", "0414-1234567", "ABCD1234", info.pdfUrl]) {
      expect(t).toContain(s);
    }
  });

  it("no inventa datos si faltan", () => {
    const t = buildPaymentMessage({ ...info, reference: null, reporterName: null, reporterPhone: null });
    expect(t).toContain("Referencia: —");
    expect(t).not.toContain("Reportado por");
  });

  it("el enlace de WhatsApp va al número de soporte con el texto codificado", () => {
    const url = whatsappPaymentUrl("Hola & adiós\nlínea 2");
    expect(url.startsWith("https://wa.me/19045796156?text=")).toBe(true);
    expect(decodeURIComponent(url.split("?text=")[1])).toBe("Hola & adiós\nlínea 2");
  });

  it("código corto y concepto del pago", () => {
    expect(paymentShortCode("clxxxxxxxxxxabcd1234")).toBe("ABCD1234");
    expect(paymentConcept("Plan solicitado: PYME.")).toBe("Suscripción — Plan Pyme");
    expect(paymentConcept(null)).toBe("Suscripción mensual");
    expect(paymentConcept("x", true)).toContain("Pago único");
  });
});

describe("enlace firmado al PDF", () => {
  let link: typeof import("@/lib/payment-link");
  beforeAll(async () => {
    process.env.AUTH_SECRET = "secreto-de-prueba-para-vitest-1234567890";
    link = await import("@/lib/payment-link");
  });

  it("acepta la firma correcta y rechaza la de otro pago o una alterada", () => {
    const t = link.signPaymentReportId("pago-1");
    expect(link.verifyPaymentReportToken("pago-1", t)).toBe(true);
    expect(link.verifyPaymentReportToken("pago-2", t)).toBe(false);
    expect(link.verifyPaymentReportToken("pago-1", t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(link.verifyPaymentReportToken("pago-1", "")).toBe(false);
    expect(link.verifyPaymentReportToken("pago-1", null)).toBe(false);
  });

  it("el enlace público incluye el id y la firma", () => {
    const url = link.paymentPdfUrl("pago-1");
    expect(url).toContain("/api/public/pagos/pago-1?t=");
    expect(url.endsWith(link.signPaymentReportId("pago-1"))).toBe(true);
  });
});

describe("PDF del pago", () => {
  it("se genera con y sin imagen de comprobante", () => {
    const base = {
      code: "ABCD1234",
      companyName: "Negocio de Prueba",
      companyCode: "XYZ123",
      concept: "Suscripción — Plan Pyme",
      amountUsdCents: 2399,
      methodLabel: "Pago Móvil",
      reference: "00123456",
      reportedAt: new Date("2026-11-21T15:30:00Z"),
      status: "PENDING" as const,
      reporterName: "Ana Pérez",
      reporterPhone: "0414-1234567",
      reporterEmail: "ana@example.com",
    };
    const sin = buildPaymentPDF({ ...base, proofImageDataUrl: null }).output("arraybuffer");
    expect(new TextDecoder().decode(sin.slice(0, 5))).toBe("%PDF-");
    // PNG de 1x1 píxel
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const con = buildPaymentPDF({ ...base, proofImageDataUrl: png }).output("arraybuffer");
    expect(con.byteLength).toBeGreaterThan(sin.byteLength);
  });
});

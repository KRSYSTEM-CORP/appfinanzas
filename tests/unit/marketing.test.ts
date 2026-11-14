import { describe, expect, it } from "vitest";
import { normalizePromoCode, promoCode, promotionMessage, segmentOf, shortDate, whatsappLink } from "@/lib/marketing";

describe("mapa de clientes", () => {
  it("cuadrantes por frecuencia (5 visitas) y gasto ($300)", () => {
    expect(segmentOf(14, 124000)).toBe("campeones");
    expect(segmentOf(7, 21000)).toBe("leales");
    expect(segmentOf(3, 38000)).toBe("riesgo");
    expect(segmentOf(1, 4500)).toBe("dormidos");
    expect(segmentOf(5, 30000)).toBe("campeones");
  });
});

describe("promociones", () => {
  it("sugiere el código como la preview", () => {
    expect(promoCode("dormidos", 15)).toBe("VUELVE15");
    expect(promoCode("cumpleaneros", 10)).toBe("CUMPLE10");
    expect(promoCode("campeones", 20)).toBe("GRACIAS20");
    expect(promoCode("todos", 5)).toBe("KRPOS5");
  });
  it("normaliza el código escrito a mano", () => {
    expect(normalizePromoCode("vuelve-15 ñ")).toBe("VUELVE15N");
    expect(normalizePromoCode("abcdefghijklmnopq")).toBe("ABCDEFGHIJKLMN");
  });
  it("arma el mensaje de WhatsApp tal cual la vista previa", () => {
    expect(promotionMessage({ code: "VUELVE15", discountPercent: 15, validUntil: "2026-12-03T12:00:00Z", firstName: "Elena" }, "Boutique Aurora")).toBe(
      "Hola Elena, te saluda Boutique Aurora. Tenemos un detalle para ti: usa el código VUELVE15 y recibe 15 % de descuento en tu próxima compra. Válido hasta el 3 dic. ¡Te esperamos!"
    );
    expect(promotionMessage({ code: "X10", discountPercent: 10, validUntil: "2026-11-30T12:00:00Z" }, "Tienda")).toContain("Hola cliente,");
    expect(shortDate("2026-11-30T12:00:00Z")).toBe("30 nov");
  });
  it("enlace wa.me con prefijo de Venezuela", () => {
    expect(whatsappLink("0412-555-2201", "Hola")).toBe("https://wa.me/584125552201?text=Hola");
  });
});

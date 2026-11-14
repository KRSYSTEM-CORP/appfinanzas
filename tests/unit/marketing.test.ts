import { describe, expect, it } from "vitest";
import { birthdayInRange, checkCoupon, couponDiscountCents, customerInPromo, normalizePromoCode, promoCode, promotionMessage, segmentOf, shortDate, whatsappLink } from "@/lib/marketing";

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

describe("cumpleañeros en un periodo", () => {
  it("ignora el año y es inclusivo", () => {
    expect(birthdayInRange("1990-11-15T12:00:00Z", "2026-11-10", "2026-11-20")).toBe(true);
    expect(birthdayInRange("1985-11-10T00:00:00Z", "2026-11-10", "2026-11-20")).toBe(true);
    expect(birthdayInRange("1985-11-20T00:00:00Z", "2026-11-10", "2026-11-20")).toBe(true);
    expect(birthdayInRange("1990-11-21T12:00:00Z", "2026-11-10", "2026-11-20")).toBe(false);
    expect(birthdayInRange(null, "2026-11-10", "2026-11-20")).toBe(false);
  });
  it("funciona cruzando fin de año", () => {
    expect(birthdayInRange("2000-01-03T12:00:00Z", "2026-12-20", "2027-01-10")).toBe(true);
    expect(birthdayInRange("2000-12-25T12:00:00Z", "2026-12-20", "2027-01-10")).toBe(true);
    expect(birthdayInRange("2000-06-25T12:00:00Z", "2026-12-20", "2027-01-10")).toBe(false);
  });
});

describe("público de la promoción", () => {
  const c = { id: "c1", segment: "dormidos" as const, birthDate: "1990-11-15T12:00:00Z" };
  it("todos, grupo, cumpleañeros y clientes elegidos", () => {
    expect(customerInPromo({ segment: "todos" }, c)).toBe(true);
    expect(customerInPromo({ segment: "dormidos" }, c)).toBe(true);
    expect(customerInPromo({ segment: "campeones" }, c)).toBe(false);
    expect(customerInPromo({ segment: "cumpleaneros", rangeFrom: "2026-11-01", rangeTo: "2026-11-30" }, c)).toBe(true);
    expect(customerInPromo({ segment: "cumpleaneros", rangeFrom: "2026-12-01", rangeTo: "2026-12-31" }, c)).toBe(false);
    expect(customerInPromo({ segment: "clientes", customerIds: ["c1", "c2"] }, c)).toBe(true);
    expect(customerInPromo({ segment: "clientes", customerIds: ["c2"] }, c)).toBe(false);
  });
});

describe("validación de cupón", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const promo = { segment: "todos", discountPercent: 15, validUntil: "2026-11-30T12:00:00Z" };
  const cust = { id: "c1", segment: "leales" as const, birthDate: null };
  it("acepta un cupón vigente", () => {
    expect(checkCoupon(promo, cust, false, now)).toEqual({ ok: true, discountPercent: 15 });
  });
  it("rechaza inexistente, vencido, sin cliente, fuera de público y repetido", () => {
    expect(checkCoupon(null, cust, false, now)).toEqual({ ok: false, error: "Cupón no válido" });
    expect(checkCoupon({ ...promo, validUntil: "2026-11-01T12:00:00Z" }, cust, false, now)).toEqual({ ok: false, error: "Cupón vencido" });
    expect(checkCoupon(promo, null, false, now).ok).toBe(false);
    expect(checkCoupon({ ...promo, segment: "campeones" }, cust, false, now).ok).toBe(false);
    expect(checkCoupon(promo, cust, true, now)).toEqual({ ok: false, error: "Este cliente ya canjeó este cupón" });
  });
  it("calcula el descuento en céntimos", () => {
    expect(couponDiscountCents(10000, 15)).toBe(1500);
    expect(couponDiscountCents(999, 10)).toBe(100);
    expect(couponDiscountCents(5000, 150)).toBe(5000);
  });
});

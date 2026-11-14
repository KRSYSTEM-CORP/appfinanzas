import { describe, expect, it } from "vitest";
import { dialCodeFor, normalizeWhatsapp } from "@/lib/business-country";

describe("normalizeWhatsapp", () => {
  it("antepone el código del país a un número local", () => {
    expect(normalizeWhatsapp("0412-555 0101", "Venezuela")).toBe("584125550101");
    expect(normalizeWhatsapp("412-5550101", "Venezuela")).toBe("584125550101");
  });
  it("no repite el código si ya lo trae", () => {
    expect(normalizeWhatsapp("+58 412 5550101", "Venezuela")).toBe("584125550101");
  });
  it("sin país conocido solo deja los dígitos", () => {
    expect(normalizeWhatsapp("+34 600 123 456", "España")).toBe("34600123456");
    expect(normalizeWhatsapp("", "Venezuela")).toBe("");
  });
  it("Colombia y Estados Unidos", () => {
    expect(normalizeWhatsapp("3001234567", "Colombia")).toBe("573001234567");
    expect(normalizeWhatsapp("2125550123", "Estados Unidos")).toBe("12125550123");
  });
});

describe("dialCodeFor", () => {
  it("ignora mayúsculas", () => {
    expect(dialCodeFor("venezuela")).toBe("58");
    expect(dialCodeFor(null)).toBeNull();
  });
});

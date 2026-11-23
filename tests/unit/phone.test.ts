import { describe, expect, it } from "vitest";
import { formatContactPhone, normalizeContactPhone, whatsappLink } from "@/lib/phone";

describe("teléfono de contacto", () => {
  it("normaliza las formas habituales de escribir un número venezolano", () => {
    for (const v of ["0412-1234567", "0412 1234567", "412 1234567", "+58 412 123 4567", "(0412) 123.45.67", "00584121234567", "+58 0412 1234567"]) {
      expect(normalizeContactPhone(v)).toBe("+584121234567");
    }
    expect(normalizeContactPhone("0212 5551234")).toBe("+582125551234");
  });
  it("acepta números de otros países con su código", () => {
    expect(normalizeContactPhone("+57 300 1234567")).toBe("+573001234567");
    expect(normalizeContactPhone("+1 (305) 555-0123")).toBe("+13055550123");
  });
  it("rechaza lo que no es un teléfono", () => {
    for (const v of ["", "   ", "abc", "12345", "0412-12", "correo@x.com", "+58 412 12345", "0000000000000000", "+0123456789"]) {
      expect(normalizeContactPhone(v)).toBeNull();
    }
  });
  it("arma el enlace de WhatsApp y el texto legible", () => {
    expect(whatsappLink("+584121234567")).toBe("https://wa.me/584121234567");
    expect(formatContactPhone("+584121234567")).toBe("+58 412 123 4567");
    expect(formatContactPhone("+573001234567")).toBe("+573001234567");
  });
});

import { describe, expect, it } from "vitest";
import { BANKS, SERVICES } from "@/lib/payment-accounts";
import { BANK_SITES, bankSiteUrl, normalizeBankSiteUrl } from "@/lib/bank-sites";

describe("sitios de bancos", () => {
  it("solo guarda direcciones https y todas pertenecen a un banco o servicio del catálogo", () => {
    const keys = new Set([...BANKS, ...SERVICES].map((b) => b.key));
    for (const [key, url] of Object.entries(BANK_SITES)) {
      expect(keys.has(key)).toBe(true);
      expect(url.startsWith("https://")).toBe(true);
    }
  });

  it("limpia lo que escribe el dueño: https obligatorio y dominio válido", () => {
    expect(normalizeBankSiteUrl("")).toBeNull();
    expect(normalizeBankSiteUrl("   ")).toBeNull();
    expect(normalizeBankSiteUrl("mibanco.com")).toBe("https://mibanco.com");
    expect(normalizeBankSiteUrl("http://mibanco.com/")).toBeNull();
    expect(normalizeBankSiteUrl("https://mibanco.com/personas/")).toBe("https://mibanco.com/personas");
    expect(normalizeBankSiteUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeBankSiteUrl("https://user:pass@mibanco.com")).toBeNull();
    expect(normalizeBankSiteUrl("localhost")).toBeNull();
  });

  it("usa la dirección escrita y, si no hay, la oficial del catálogo", () => {
    expect(bankSiteUrl({ bankKey: "banesco" })).toBe("https://www.banesco.com");
    expect(bankSiteUrl({ bankKey: "banesco", websiteUrl: "https://otro.com" })).toBe("https://otro.com");
    expect(bankSiteUrl({ bankKey: null }, "zelle")).toBe("https://www.zelle.com");
    expect(bankSiteUrl({ bankKey: "bod" })).toBeNull();
  });
});

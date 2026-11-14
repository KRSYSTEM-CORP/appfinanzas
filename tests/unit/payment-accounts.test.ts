import { describe, expect, it } from "vitest";
import { accountClipboardText, bankLogoSrc, defaultBankKey } from "@/lib/payment-accounts";
import { existsSync } from "node:fs";
import { BANKS, SERVICES, activeMethodCount, settingsMethods } from "@/lib/payment-accounts";

describe("métodos de pago de Ajustes", () => {
  it("sin cuentas solo cuentan los métodos que no necesitan datos", () => {
    expect(activeMethodCount([], true)).toBe(3);
  });
  it("suma los métodos con una cuenta visible y no cuenta las ocultas", () => {
    expect(activeMethodCount([{ kind: "ZELLE", active: true }, { kind: "BINANCE", active: false }], true)).toBe(4);
  });
  it("sin tasa de cambio el efectivo es uno solo", () => {
    const m = settingsMethods(false);
    expect(m.find((x) => x.id === "ebs")).toBeUndefined();
    expect(m.find((x) => x.id === "ed")?.label).toBe("Efectivo");
  });
});

describe("cuentas de cobro", () => {
  it("devuelve el logo solo para claves conocidas", () => {
    expect(bankLogoSrc("bnc")).toBe("/banks/bnc.png");
    expect(bankLogoSrc("nope")).toBeNull();
    expect(bankLogoSrc(null)).toBeNull();
  });
  it("cada banco del catálogo tiene su archivo de logo", () => {
    for (const b of [...BANKS, ...SERVICES]) {
      expect(existsSync(`public/banks/${b.key}.png`), b.key).toBe(true);
    }
  });
  it("usa el logo del servicio para Zelle, Binance y PayPal", () => {
    expect(defaultBankKey("ZELLE")).toBe("zelle");
    expect(defaultBankKey("PAGO_MOVIL")).toBeNull();
  });
  it("arma el texto para copiar", () => {
    const t = accountClipboardText({
      kind: "PAGO_MOVIL",
      bankName: "Banesco",
      holder: "Tienda C.A.",
      accountNumber: "0412-1234567",
      docId: "J-12345678-9",
    });
    expect(t).toContain("Pago móvil · Banesco");
    expect(t).toContain("Teléfono: 0412-1234567");
    expect(t).toContain("Cédula/RIF: J-12345678-9");
  });
});

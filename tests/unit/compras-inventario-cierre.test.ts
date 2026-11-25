import { describe, expect, it } from "vitest";
import { defaultAccountFor, accountChoiceMessage } from "@/lib/payment-method-accounts";
import { resolveImportCurrency } from "@/lib/purchase-math";
import { parseCsvRows } from "@/lib/spreadsheet";

describe("cuenta preseleccionada según el método", () => {
  const accounts = [
    { id: "a", kind: "PAGO_MOVIL", balanceCents: 100 },
    { id: "b", kind: "PAGO_MOVIL", balanceCents: 5000 },
    { id: "c", kind: "ZELLE", balanceCents: 1 },
  ];
  it("elige la única cuenta o la de mayor saldo", () => {
    expect(defaultAccountFor("ZELLE", accounts)).toBe("c");
    expect(defaultAccountFor("CARD", accounts)).toBe("b");
  });
  it("efectivo y métodos sin cuentas no preseleccionan nada", () => {
    expect(defaultAccountFor("CASH", accounts)).toBe("");
    expect(defaultAccountFor("BINANCE", accounts)).toBe("");
  });
  it("exige la cuenta cuando el método tiene cuentas", () => {
    expect(accountChoiceMessage("CARD", accounts, "")).not.toBeNull();
    expect(accountChoiceMessage("CARD", accounts, "a")).toBeNull();
    expect(accountChoiceMessage("CASH", accounts, "")).toBeNull();
  });
});

describe("moneda en la importación de compras", () => {
  it("vacío es la moneda de referencia", () => {
    expect(resolveImportCurrency(undefined, "VES", "USD")).toBe("REFERENCE");
    expect(resolveImportCurrency("  ", "VES", "EUR")).toBe("REFERENCE");
  });
  it("reconoce Bs/VES y divisas", () => {
    expect(resolveImportCurrency("Bs", "VES", "USD")).toBe("LOCAL");
    expect(resolveImportCurrency("ves", "VES", "USD")).toBe("LOCAL");
    expect(resolveImportCurrency("$", "VES", "USD")).toBe("REFERENCE");
    expect(resolveImportCurrency("EUR", "VES", "EUR")).toBe("REFERENCE");
  });
  it("rechaza monedas desconocidas", () => {
    expect(() => resolveImportCurrency("GBP", "VES", "USD")).toThrow(/no válida/);
  });
});

describe("CSV de importación", () => {
  it("lee comillas, comas dentro del texto y BOM", () => {
    const rows = parseCsvRows('﻿Nombre,Precio\n"Parche, con coma",1.5\nOtro,2\n');
    expect(rows).toEqual([
      { Nombre: "Parche, con coma", Precio: "1.5" },
      { Nombre: "Otro", Precio: "2" },
    ]);
  });
  it("detecta punto y coma con decimales con coma", () => {
    const rows = parseCsvRows("Nombre;Costo\nA;1,25\nB;1.234,50\n");
    expect(rows).toEqual([
      { Nombre: "A", Costo: "1.25" },
      { Nombre: "B", Costo: "1234.50" },
    ]);
  });
  it("ignora filas vacías", () => {
    expect(parseCsvRows("a,b\n,\n1,2\n")).toEqual([{ a: "1", b: "2" }]);
  });
});

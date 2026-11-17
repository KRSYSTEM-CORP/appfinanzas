import { describe, expect, it } from "vitest";
import {
  aggregateByCurrency,
  formatCurrencyTotals,
  lineCurrency,
  pivotByCurrency,
  refToLocalCents,
  sortCurrencyCodes,
  sumRefCents,
} from "@/lib/currency-breakdown";

// Venta mixta: 40,00 € de referencia pagados 20,00 en Bs (tasa 50 → 1.000,00 Bs) y 20,00 en USD.
const lines = [
  { paymentMethod: "CARD", amountEurCents: 2000, currencyCode: "VES", amountCurrencyCents: 100000 },
  { paymentMethod: "ZELLE", amountEurCents: 2000, currencyCode: "USD", amountCurrencyCents: 2000 },
  { paymentMethod: "CASH", amountEurCents: 500, currencyCode: "VES", amountCurrencyCents: 25000 },
];

describe("currency-breakdown", () => {
  it("separa lo cobrado por moneda real, con Bs primero", () => {
    const t = aggregateByCurrency(lines, "EUR", "VES");
    expect(t.map((x) => x.code)).toEqual(["VES", "USD"]);
    expect(t[0]).toMatchObject({ cents: 125000, refCents: 2500, count: 2 });
    expect(t[1]).toMatchObject({ cents: 2000, refCents: 2000, count: 1 });
    expect(sumRefCents(t)).toBe(4500);
  });

  it("filas viejas sin moneda: USD para Zelle y la referencia para el resto", () => {
    expect(lineCurrency({ paymentMethod: "ZELLE", currencyCode: null }, "EUR")).toBe("USD");
    expect(lineCurrency({ paymentMethod: "CASH", currencyCode: null }, "EUR")).toBe("EUR");
    const t = aggregateByCurrency([{ paymentMethod: "CASH", amountEurCents: 700 }], "EUR", "VES");
    expect(t).toEqual([{ code: "EUR", cents: 700, refCents: 700, count: 1 }]);
  });

  it("formatea cada monto en su moneda y omite los ceros", () => {
    const s = formatCurrencyTotals([
      { code: "VES", cents: 125000 },
      { code: "USD", cents: 2000 },
      { code: "EUR", cents: 0 },
    ]);
    expect(s).toContain("Bs.");
    expect(s).toContain("1.250,00");
    expect(s).toContain("$20.00");
    expect(s).not.toContain("€");
    expect(formatCurrencyTotals([])).toBe("—");
  });

  it("ordena moneda local, USD, EUR y el resto", () => {
    expect(sortCurrencyCodes(["EUR", "USD", "COP", "VES"], "VES")).toEqual(["VES", "USD", "EUR", "COP"]);
  });

  it("arma la matriz clave × moneda sin mezclar monedas", () => {
    const p = pivotByCurrency(
      [
        { key: "Efectivo", currency: "VES", cents: 25000, refCents: 500, n: 1 },
        { key: "Efectivo", currency: "USD", cents: 1000, refCents: 1000, n: 2 },
        { key: "Zelle", currency: "USD", cents: 2000, refCents: 2000, n: 1 },
      ],
      "VES"
    );
    expect(p.currencies).toEqual(["VES", "USD"]);
    const ef = p.rows.find((r) => r.key === "Efectivo")!;
    expect(ef.cells.VES.cents).toBe(25000);
    expect(ef.cells.USD.cents).toBe(1000);
    expect(ef.refCents).toBe(1500);
    expect(ef.n).toBe(3);
  });

  it("el equivalente local es solo informativo y nulo sin tasa", () => {
    expect(refToLocalCents(2000, 50)).toBe(100000);
    expect(refToLocalCents(2000, null)).toBeNull();
  });
});

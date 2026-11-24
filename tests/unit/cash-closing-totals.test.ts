import { describe, expect, it } from "vitest";
import { countedDifference, differenceLabel, expectedCashByCurrency } from "@/lib/cash-closing";

const base = { referenceCurrency: "USD", localCurrency: "VES", openingCents: null, openingRefCents: null, openingLocalCents: null, outflowsCents: 0, incomeRows: [] };

describe("efectivo esperado por moneda", () => {
  it("separa dólares y bolívares y resta las salidas de los dólares", () => {
    const e = expectedCashByCurrency({
      ...base,
      openingCents: 5000, openingRefCents: 3000, openingLocalCents: 2_000_000,
      incomeRows: [
        { paymentMethod: "CASH", currencyCode: "USD", cents: 1000, refCents: 1000 },
        { paymentMethod: "CASH", currencyCode: "VES", cents: 1_000_000, refCents: 500 },
        { paymentMethod: "POS", currencyCode: "VES", cents: 99_999, refCents: 999 },
      ],
      outflowsCents: 700,
    });
    expect(e).toEqual({ refCents: 3000 + 1000 - 700, localCents: 3_000_000 });
  });
  it("aperturas antiguas sin desglose cuentan como dólares", () => {
    expect(expectedCashByCurrency({ ...base, openingCents: 4000 })).toEqual({ refCents: 4000, localCents: 0 });
  });
  it("diferencia por moneda: sobrante y faltante", () => {
    const d = countedDifference({ refCents: 4000, localCents: 10_000 }, { usdCents: 4500, bsCents: 6000 });
    expect(d).toEqual({ refDiffCents: 500, localDiffCents: -4000 });
    expect(differenceLabel(d.refDiffCents)).toBe("Sobrante");
    expect(differenceLabel(d.localDiffCents)).toBe("Faltante");
    expect(differenceLabel(0)).toBe("Cuadra");
  });
});

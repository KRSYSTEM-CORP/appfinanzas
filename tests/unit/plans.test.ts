import { describe, expect, it } from "vitest";
import { PLANS, amountDueUsdCents, getPlan, productLimitMessage } from "@/lib/plans";

describe("planes", () => {
  it("Emprende cobra $10 el primer mes y $12,99 después", () => {
    expect(amountDueUsdCents("EMPRENDE", false)).toBe(1000);
    expect(amountDueUsdCents("EMPRENDE", true)).toBe(1299);
  });
  it("Pyme y Corporativo no tienen promoción", () => {
    expect(amountDueUsdCents("PYME", false)).toBe(2399);
    expect(amountDueUsdCents("CORPORATIVO", false)).toBe(4499);
  });
  it("Contabilidad solo en Pyme y Corporativo", () => {
    expect(PLANS.EMPRENDE.accounting).toBe(false);
    expect(PLANS.PYME.accounting).toBe(true);
    expect(PLANS.CORPORATIVO.accounting).toBe(true);
  });
  it("Corporativo tiene productos ilimitados", () => {
    expect(PLANS.CORPORATIVO.maxProducts).toBeNull();
    expect(productLimitMessage(PLANS.CORPORATIVO)).toBeNull();
    expect(PLANS.EMPRENDE.maxProducts).toBe(100);
    expect(PLANS.PYME.maxProducts).toBe(500);
  });
  it("un plan desconocido cae en Corporativo (sin recortar a nadie)", () => {
    expect(getPlan("xyz").id).toBe("CORPORATIVO");
    expect(getPlan(null).id).toBe("CORPORATIVO");
  });
});

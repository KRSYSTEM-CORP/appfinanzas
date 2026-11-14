import { describe, expect, it } from "vitest";
import { parsePlanRequest, planAmountDueUsdCents, planRequestNote, recommendPlan } from "@/lib/plans";

describe("plan request", () => {
  it("round-trips the note", () => {
    expect(parsePlanRequest(planRequestNote("PYME", "hola"))).toBe("PYME");
    expect(parsePlanRequest("Pagué por Binance")).toBeNull();
    expect(parsePlanRequest(null)).toBeNull();
  });
  it("first month of Emprende is $9,99 only without approved payment", () => {
    const base = { selected: "EMPRENDE" as const, current: "EMPRENDE" as const, monthlyFeeUsdCents: 1299 };
    expect(planAmountDueUsdCents({ ...base, hasApprovedPayment: false })).toBe(999);
    expect(planAmountDueUsdCents({ ...base, hasApprovedPayment: true })).toBe(1299);
    expect(planAmountDueUsdCents({ selected: "PYME", current: "EMPRENDE", monthlyFeeUsdCents: 1299, hasApprovedPayment: false })).toBe(2399);
  });
  it("respects a custom fee on the current plan", () => {
    expect(planAmountDueUsdCents({ selected: "PYME", current: "PYME", monthlyFeeUsdCents: 1500, hasApprovedPayment: true })).toBe(1500);
  });
  it("recommends by usage", () => {
    expect(recommendPlan(1, 100).id).toBe("EMPRENDE");
    expect(recommendPlan(2, 100).id).toBe("PYME");
    expect(recommendPlan(4, 100).id).toBe("PYME");
    expect(recommendPlan(3, 300).id).toBe("PYME");
    expect(recommendPlan(8, 900).id).toBe("CORPORATIVO");
  });
});

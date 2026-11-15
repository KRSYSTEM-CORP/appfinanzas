import { describe, expect, it } from "vitest";
import { payrollSettlement, shiftPeriod } from "@/lib/payroll";

describe("payrollSettlement", () => {
  it("deja saldo pendiente cuando se paga menos de lo devengado", () => {
    expect(payrollSettlement(10_000, 4_000)).toEqual({ owedCents: 10_000, paidCents: 4_000, pendingCents: 6_000, advanceCents: 0 });
  });
  it("marca el sobrante como adelanto cuando se paga de más", () => {
    expect(payrollSettlement(10_000, 12_500)).toEqual({ owedCents: 10_000, paidCents: 12_500, pendingCents: 0, advanceCents: 2_500 });
  });
  it("queda en cero cuando se paga exacto", () => {
    expect(payrollSettlement(10_000, 10_000).pendingCents).toBe(0);
  });
});

describe("shiftPeriod", () => {
  it("avanza y retrocede entre quincenas y meses", () => {
    expect(shiftPeriod("2026-11-1", 1)).toBe("2026-11-2");
    expect(shiftPeriod("2026-11-2", 1)).toBe("2026-12-1");
    expect(shiftPeriod("2026-12-2", 1)).toBe("2027-01-1");
    expect(shiftPeriod("2026-01-1", -1)).toBe("2025-12-2");
  });
});

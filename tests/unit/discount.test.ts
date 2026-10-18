import { describe, expect, it } from "vitest";
import { computeItemDiscountCents } from "@/lib/discount";

describe("computeItemDiscountCents", () => {
  it("calcula el descuento por línea redondeado al céntimo", () => {
    expect(computeItemDiscountCents(10000, 10)).toBe(1000);
    expect(computeItemDiscountCents(333, 10)).toBe(33);
    expect(computeItemDiscountCents(5000, 0)).toBe(0);
    expect(computeItemDiscountCents(5000, 100)).toBe(5000);
  });
});

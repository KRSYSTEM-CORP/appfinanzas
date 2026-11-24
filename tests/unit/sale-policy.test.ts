import { describe, expect, it } from "vitest";
import { discountPolicyError, isOfflineRateAcceptable, sanitizeQueuedAt } from "@/lib/sale-policy";

describe("sale-policy", () => {
  it("exige gerente y motivo para exonerar", () => {
    expect(discountPolicyError({ discountPercent: 100, hasCoupon: false, isManager: false, note: "xyz" })).toMatch(/gerente/);
    expect(discountPolicyError({ discountPercent: 100, hasCoupon: false, isManager: true, note: "" })).toMatch(/motivo/);
    expect(discountPolicyError({ discountPercent: 100, hasCoupon: false, isManager: true, note: "regalo" })).toBeNull();
  });
  it("topa el descuento del vendedor y deja pasar cupones", () => {
    expect(discountPolicyError({ discountPercent: 50, hasCoupon: false, isManager: false })).toMatch(/máximo/);
    expect(discountPolicyError({ discountPercent: 50, hasCoupon: true, isManager: false })).toBeNull();
    expect(discountPolicyError({ discountPercent: 10, hasCoupon: false, isManager: false })).toBeNull();
  });
  it("acepta la tasa offline solo en cola y dentro de la banda", () => {
    expect(isOfflineRateAcceptable(105, 100, true)).toBe(true);
    expect(isOfflineRateAcceptable(105, 100, false)).toBe(false);
    expect(isOfflineRateAcceptable(60, 100, true)).toBe(false);
  });
  it("valida la fecha encolada", () => {
    const now = new Date("2026-11-23T12:00:00Z");
    expect(sanitizeQueuedAt("2026-11-22T10:00:00Z", now)?.toISOString()).toBe("2026-11-22T10:00:00.000Z");
    expect(sanitizeQueuedAt("2026-12-30T10:00:00Z", now)).toBeNull();
    expect(sanitizeQueuedAt("2026-01-01T10:00:00Z", now)).toBeNull();
    expect(sanitizeQueuedAt("basura", now)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { computeDiscountCents, couponLabel, isValidCouponCode, normalizeCouponCode, validateCoupon, type CouponLike } from "@/lib/coupons";

const base: CouponLike = { active: true, discountType: "PERCENT", percentOff: 20, amountOffUsd: null, plan: null, companyId: null, expiresAt: null, maxUses: 1, usedCount: 0 };
const ctx = { companyId: "c1", plan: "PYME", now: new Date("2026-11-16T12:00:00Z") };

describe("descuento", () => {
  it("porcentaje redondeado", () => {
    expect(computeDiscountCents(base, 2399)).toBe(480);
    expect(computeDiscountCents({ ...base, percentOff: 100 }, 1299)).toBe(1299);
    expect(computeDiscountCents({ ...base, percentOff: 250 }, 1000)).toBe(1000);
  });
  it("monto fijo sin pasar del total", () => {
    const amt = { discountType: "AMOUNT", percentOff: null, amountOffUsd: 500 };
    expect(computeDiscountCents(amt, 1299)).toBe(500);
    expect(computeDiscountCents(amt, 300)).toBe(300);
    expect(computeDiscountCents(amt, 0)).toBe(0);
  });
  it("etiqueta y código", () => {
    expect(couponLabel(base)).toBe("20 % de descuento");
    expect(couponLabel({ discountType: "AMOUNT", percentOff: null, amountOffUsd: 500 })).toBe("$5,00 de descuento");
    expect(normalizeCouponCode(" bienvenida 10 ")).toBe("BIENVENIDA10");
    expect(isValidCouponCode("AB")).toBe(false);
    expect(isValidCouponCode("NOV-2026")).toBe(true);
  });
});

describe("validación", () => {
  it("acepta uno vigente", () => expect(validateCoupon(base, ctx)).toEqual({ ok: true }));
  it("no existe", () => expect(validateCoupon(null, ctx)).toMatchObject({ ok: false, error: expect.stringContaining("no existe") }));
  it("inactivo, vencido y agotado", () => {
    expect(validateCoupon({ ...base, active: false }, ctx)).toMatchObject({ ok: false });
    expect(validateCoupon({ ...base, expiresAt: new Date("2026-11-01") }, ctx)).toMatchObject({ error: "Ese cupón venció." });
    expect(validateCoupon({ ...base, maxUses: 3, usedCount: 3 }, ctx)).toMatchObject({ ok: false });
    expect(validateCoupon({ ...base, maxUses: 3, usedCount: 2 }, ctx)).toEqual({ ok: true });
    expect(validateCoupon({ ...base, maxUses: null, usedCount: 99 }, ctx)).toEqual({ ok: true });
  });
  it("empresa, plan y un solo uso por empresa", () => {
    expect(validateCoupon({ ...base, companyId: "otra" }, ctx)).toMatchObject({ ok: false });
    expect(validateCoupon({ ...base, companyId: "c1" }, ctx)).toEqual({ ok: true });
    expect(validateCoupon({ ...base, plan: "EMPRENDE" }, ctx)).toMatchObject({ ok: false });
    expect(validateCoupon(base, { ...ctx, alreadyRedeemedByCompany: true })).toMatchObject({ error: "Tu empresa ya usó ese cupón." });
  });
});

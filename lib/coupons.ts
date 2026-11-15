// Cupones de suscripción de la plataforma (lógica pura). El precio base lo definen los
// planes (lib/plans.ts); el cupón solo descuenta. El servidor siempre recalcula.
//
// Regla de canje: cada cupón es de UN SOLO USO por empresa (índice único cupón+empresa).
// El canje se RESERVA al reportar el pago (cuenta en usedCount) y se LIBERA si el
// superadmin rechaza ese reporte; si se aprueba, queda consumido.
export type CouponDiscountType = "PERCENT" | "AMOUNT";

export type CouponLike = {
  active: boolean;
  discountType: string;
  percentOff: number | null;
  amountOffUsd: number | null; // centavos de USD
  plan: string | null;
  companyId: string | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
};

export function normalizeCouponCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidCouponCode(code: string): boolean {
  return /^[A-Z0-9_-]{3,24}$/.test(code);
}

// Descuento en centavos de USD sobre el monto a pagar; nunca supera el monto ni es negativo.
export function computeDiscountCents(
  coupon: Pick<CouponLike, "discountType" | "percentOff" | "amountOffUsd">,
  dueCents: number
): number {
  if (!Number.isFinite(dueCents) || dueCents <= 0) return 0;
  const raw =
    coupon.discountType === "PERCENT"
      ? Math.round((dueCents * Math.min(100, Math.max(0, coupon.percentOff ?? 0))) / 100)
      : Math.max(0, coupon.amountOffUsd ?? 0);
  return Math.min(dueCents, raw);
}

export type CouponCheck = { ok: true } | { ok: false; error: string };

export function validateCoupon(
  coupon: CouponLike | null,
  ctx: { companyId: string; plan: string; now: Date; alreadyRedeemedByCompany?: boolean }
): CouponCheck {
  if (!coupon) return { ok: false, error: "Ese cupón no existe. Revisa el código." };
  if (!coupon.active) return { ok: false, error: "Ese cupón está desactivado." };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < ctx.now.getTime()) return { ok: false, error: "Ese cupón venció." };
  if (coupon.companyId && coupon.companyId !== ctx.companyId) return { ok: false, error: "Ese cupón no es para tu empresa." };
  if (ctx.alreadyRedeemedByCompany) return { ok: false, error: "Tu empresa ya usó ese cupón." };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) return { ok: false, error: "Ese cupón ya se usó el máximo de veces." };
  if (coupon.plan && coupon.plan !== ctx.plan) return { ok: false, error: "Ese cupón aplica a otro plan." };
  return { ok: true };
}

export function couponLabel(c: Pick<CouponLike, "discountType" | "percentOff" | "amountOffUsd">): string {
  return c.discountType === "PERCENT" ? `${c.percentOff ?? 0} % de descuento` : `$${((c.amountOffUsd ?? 0) / 100).toFixed(2).replace(".", ",")} de descuento`;
}

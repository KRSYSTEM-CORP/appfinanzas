import type { Prisma } from "@prisma/client";
import { checkCoupon, COUPON_INVALID, normalizePromoCode, segmentOf, type CouponCheck } from "@/lib/marketing";

export const GENERAL_CUSTOMER_PHONE = "0000-0000000";

export type ResolvedCoupon = {
  check: CouponCheck;
  promotionId: string | null;
  code: string;
  customerId: string | null;
};

// Valida un cupón contra la empresa y el cliente de la venta (se llama al canjear en el POS y otra vez al
// completar la venta). Debe correr dentro de withTenant.
export async function resolveCoupon(tx: Prisma.TransactionClient, companyId: string, rawCode: string, customerPhone: string | null): Promise<ResolvedCoupon> {
  const code = normalizePromoCode(rawCode ?? "");
  if (code.length < 3) return { check: { ok: false, error: COUPON_INVALID }, promotionId: null, code, customerId: null };
  const promo = await tx.promotion.findFirst({ where: { companyId, code } });
  if (!promo) return { check: { ok: false, error: COUPON_INVALID }, promotionId: null, code, customerId: null };
  const noClient = (error: string) => ({ check: { ok: false, error } as CouponCheck, promotionId: promo.id, code, customerId: null });
  if (!customerPhone || customerPhone === GENERAL_CUSTOMER_PHONE) {
    return noClient("Selecciona un cliente (nombre y apellido) para canjear el cupón");
  }
  const customer = await tx.customer.findUnique({ where: { companyId_phone: { companyId, phone: customerPhone } } });
  if (!customer) {
    // Cliente nuevo: sin historial ni cumpleaños; solo califica en promociones para todos.
    const check = checkCoupon(promo, { id: null, segment: "dormidos", birthDate: null }, false);
    return { check, promotionId: promo.id, code, customerId: null };
  }
  const stats = await tx.sale.aggregate({
    where: { companyId, customerId: customer.id, voided: false },
    _count: true,
    _sum: { totalCents: true },
  });
  const segment = segmentOf(stats._count, stats._sum.totalCents ?? 0);
  const redeemed = await tx.promotionRedemption.findFirst({ where: { promotionId: promo.id, customerId: customer.id }, select: { id: true } });
  const check = checkCoupon(promo, { id: customer.id, segment, birthDate: customer.birthDate }, redeemed != null);
  return { check, promotionId: promo.id, code, customerId: customer.id };
}

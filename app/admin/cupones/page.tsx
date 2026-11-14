import { PlatformShell } from "@/components/admin/PlatformShell";
import { CouponsView } from "@/components/admin/CouponsView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getCompanyDirectory, listCouponRedemptions, listCoupons } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformCouponsPage() {
  await requireSuperAdmin();
  const [rows, coupons, redemptions] = await Promise.all([getCompanyDirectory(), listCoupons(), listCouponRedemptions()]);
  return (
    <PlatformShell sub="cupones">
      <CouponsView coupons={coupons} redemptions={redemptions} rows={rows} nowIso={new Date().toISOString()} />
    </PlatformShell>
  );
}

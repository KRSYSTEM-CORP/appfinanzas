import { PlatformShell } from "@/components/admin/PlatformShell";
import { CrmView } from "@/components/admin/CrmView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getCompanyDirectory, listCoupons } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformCrmPage() {
  await requireSuperAdmin();
  const [rows, coupons] = await Promise.all([getCompanyDirectory(), listCoupons()]);
  return (
    <PlatformShell sub="crm">
      <CrmView rows={rows} coupons={coupons} nowIso={new Date().toISOString()} />
    </PlatformShell>
  );
}

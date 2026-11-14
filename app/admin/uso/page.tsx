import { PlatformShell } from "@/components/admin/PlatformShell";
import { UsageView } from "@/components/admin/UsageView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getCompanyDirectory } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformUsagePage() {
  await requireSuperAdmin();
  const rows = await getCompanyDirectory();
  return (
    <PlatformShell sub="uso">
      <UsageView rows={rows} nowIso={new Date().toISOString()} />
    </PlatformShell>
  );
}

import { PlatformShell } from "@/components/admin/PlatformShell";
import { CollectionsView } from "@/components/admin/CollectionsView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getCompanyDirectory } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformCollectionsPage() {
  await requireSuperAdmin();
  const rows = await getCompanyDirectory();
  return (
    <PlatformShell sub="cobranza">
      <CollectionsView rows={rows} nowIso={new Date().toISOString()} />
    </PlatformShell>
  );
}

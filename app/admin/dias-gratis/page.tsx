import { PlatformShell } from "@/components/admin/PlatformShell";
import { TrialDaysView } from "@/components/admin/TrialDaysView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { listTrialCompanies } from "@/lib/actions/trial";

export const dynamic = "force-dynamic";

export default async function PlatformTrialDaysPage() {
  await requireSuperAdmin();
  const rows = await listTrialCompanies();
  return (
    <PlatformShell sub="dias-gratis">
      <TrialDaysView rows={rows} nowIso={new Date().toISOString()} />
    </PlatformShell>
  );
}

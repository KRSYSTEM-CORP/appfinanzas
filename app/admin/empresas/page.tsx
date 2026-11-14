import { PlatformShell } from "@/components/admin/PlatformShell";
import { CompaniesView } from "@/components/admin/CompaniesView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getCompanyDirectory } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformCompaniesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSuperAdmin();
  const { q } = await searchParams;
  const rows = await getCompanyDirectory();
  return (
    <PlatformShell sub="empresas">
      <CompaniesView rows={rows} currentUserId={session.userId} nowIso={new Date().toISOString()} initialQ={q ?? ""} />
    </PlatformShell>
  );
}

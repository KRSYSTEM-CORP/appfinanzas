import { PlatformShell } from "@/components/admin/PlatformShell";
import { ApprovalsView } from "@/components/admin/ApprovalsView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { listPendingCreditRequests, listPendingPaymentReports } from "@/lib/actions/admin";
import { getCompanyDirectory } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformApprovalsPage() {
  await requireSuperAdmin();
  const [rows, reports, credits] = await Promise.all([getCompanyDirectory(), listPendingPaymentReports(), listPendingCreditRequests()]);
  const companies = rows
    .filter((r) => r.ownerStatus === "PENDING")
    .map((r) => ({ id: r.id, name: r.name, ownerId: r.ownerId, ownerEmail: r.ownerEmail, createdAt: r.createdAt, plan: r.plan }));
  return (
    <PlatformShell sub="aprobaciones">
      <ApprovalsView companies={companies} reports={reports} credits={credits} />
    </PlatformShell>
  );
}

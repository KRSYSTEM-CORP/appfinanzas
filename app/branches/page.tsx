import { BranchComparison, BranchRulesCard, BranchTransfersCard } from "@/components/branches/NetworkPanels";
import { listTransferSuggestions, listTransfers } from "@/lib/actions/transfers";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { BranchCards } from "@/components/branches/BranchCards";
import { branchOverview } from "@/lib/actions/branches";
import { requireManagerPermission } from "@/lib/session";
import { branchLimitMessage, getPlan } from "@/lib/plans";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { PeriodBar } from "@/components/shared/PeriodBar";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const session = await requireManagerPermission("branches");
  const [{ summaries, currency }, suggestions, transfers, { exchangeRateEnabled }] = await Promise.all([
    branchOverview(),
    listTransferSuggestions(),
    listTransfers(5),
    getExchangeRateInfo(),
  ]);
  const planDef = getPlan(session.plan);
  const atLimit = !session.isSuperAdmin && planDef.maxBranches != null && summaries.length >= planDef.maxBranches;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthLabel = now.toLocaleDateString("es-VE", { month: "long" }).replace(/^./, (c) => c.toUpperCase());
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <PageHeader
        eyebrow={`${session.companyName} · Acceso por sede`}
        title="Sucursales"
        actions={
          <Link href={atLimit ? "/billing" : "/settings"} className={buttonVariants({ size: "lg" })}>
            <PlusIcon aria-hidden /> {atLimit ? "Sube de plan para más sucursales" : "Nueva sucursal"}
          </Link>
        }
      >
        <div className="mt-3">
          <PeriodBar label={`${monthLabel} · día ${now.getDate()} de ${daysInMonth}`} />
        </div>
      </PageHeader>
      {atLimit && <p className="text-sm text-muted-foreground">{branchLimitMessage(planDef)}</p>}
      {summaries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aún no hay sucursales.</p>
      ) : (
        <>
          <BranchCards summaries={summaries} currency={currency} currentBranchId={session.branchId} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <BranchComparison summaries={summaries} currency={currency} />
            <BranchTransfersCard suggestions={suggestions} transfers={transfers} />
          </div>
          <BranchRulesCard exchangeRateEnabled={exchangeRateEnabled} />
        </>
      )}
    </div>
  );
}

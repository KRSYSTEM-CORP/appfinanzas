import { BranchComparison, BranchRulesCard, BranchTransfersCard } from "@/components/branches/NetworkPanels";
import { listTransferSuggestions, listTransfers } from "@/lib/actions/transfers";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { BranchCards } from "@/components/branches/BranchCards";
import { branchOverview } from "@/lib/actions/branches";
import { requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const session = await requirePermission("branches");
  const [{ summaries, currency }, suggestions, transfers, { exchangeRateEnabled }] = await Promise.all([
    branchOverview(),
    listTransferSuggestions(),
    listTransfers(5),
    getExchangeRateInfo(),
  ]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">{session.companyName} · Acceso por sede</p>
        <h1 className="kr-h1">Sucursales</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resumen de cada sede. Para entrar a una necesitas tu clave de administrador. Las sucursales se crean y editan en
          Ajustes.
        </p>
      </div>
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

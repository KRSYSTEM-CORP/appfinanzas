import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { PromotionsPanel } from "@/components/customers/PromotionsPanel";
import { listPromotions } from "@/lib/actions/marketing";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PromotionsPage() {
  const session = await requireSectionAccess("customers");
  const promotions = await listPromotions();
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Clientes y seguimiento</p>
        <h1 className="kr-h1">Marketing</h1>
      </div>
      <MarketingTabs active="/customers/promotions" />
      <PromotionsPanel promotions={promotions} businessName={session.companyName} />
    </div>
  );
}

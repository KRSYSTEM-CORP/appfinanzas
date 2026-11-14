import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { PromotionsPanel } from "@/components/customers/PromotionsPanel";
import { getMarketingInsights, listPromotions } from "@/lib/actions/marketing";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

// Marketing → Promociones.
export default async function PromotionsPage() {
  const session = await requireSectionAccess("customers");
  const [promotions, insights] = await Promise.all([listPromotions(), getMarketingInsights()]);
  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <MarketingTabs active="/customers/promotions" />
      <PromotionsPanel
        promotions={promotions}
        businessName={session.companyName}
        customers={insights.customers.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          segment: c.segment,
          birthdayThisMonth: c.birthdayThisMonth,
        }))}
      />
    </div>
  );
}

import Link from "next/link";
import { LightbulbIcon, PlusIcon, StarIcon, TrendingDownIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImportCustomers } from "@/components/customers/ImportCustomers";
import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { RequireCustomerToggle } from "@/components/customers/RequireCustomerToggle";
import { CrmView } from "@/components/customers/CrmView";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { SectionCard } from "@/components/shared/SectionCard";
import { getMarketingInsights, getRequireCustomerOnSale } from "@/lib/actions/marketing";
import { listUpcomingBirthdays } from "@/lib/actions/customers";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { todayDateString } from "@/lib/report-types";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

// Marketing → Clientes (CRM).
export default async function CustomersPage() {
  const [session, requireCustomer, insights, birthdays, { referenceCurrency }] = await Promise.all([
    requireSectionAccess("customers"),
    getRequireCustomerOnSale(),
    getMarketingInsights(),
    listUpcomingBirthdays(30),
    getExchangeRateInfo(),
  ]);
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;
  const today = todayDateString();
  const now = Date.parse(`${today}T23:59:59Z`);

  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <MarketingTabs active="/customers" />
      <KpiGrid>
        <Kpi tone="info" icon={<UsersIcon />} label="Clientes" value={insights.kpis.registered} hint="Registrados" />
        <Kpi tone="ok" icon={<StarIcon />} label="Frecuentes" value={insights.kpis.frequent} hint="6 visitas o más" />
        <Kpi tone="warn" icon={<LightbulbIcon />} label="Cumpleañeros" value={insights.kpis.birthdays} hint="Este mes" />
        <Kpi tone="bad" icon={<TrendingDownIcon />} label="Inactivos" value={insights.kpis.inactive} hint="Más de 45 días sin venir" />
      </KpiGrid>
      <SectionCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RequireCustomerToggle initial={requireCustomer} canChange={canManage} />
          <div className="flex flex-wrap items-center gap-2">
            <ImportCustomers />
            <Button nativeButton={false} render={<Link href="/customers/new" />}>
              <PlusIcon aria-hidden /> Añadir cliente
            </Button>
          </div>
        </div>
      </SectionCard>
      <CrmView
        today={today}
        currency={referenceCurrency}
        canManage={canManage}
        businessName={session.companyName}
        birthdays={birthdays}
        customers={insights.customers.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email,
          notes: c.notes,
          visits: c.visits,
          spentCents: c.spentCents,
          lastVisitDays: c.lastVisit ? Math.floor((now - new Date(c.lastVisit).getTime()) / 86_400_000) : null,
          nextContactDate: c.nextContactDate ? c.nextContactDate.slice(0, 10) : null,
          segment: c.segment,
          isNew: c.isNew,
          birthdayThisMonth: c.birthdayThisMonth,
        }))}
      />
    </div>
  );
}

import Link from "next/link";
import { AlertTriangleIcon, CakeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImportCustomers } from "@/components/customers/ImportCustomers";
import { MarketingInsights } from "@/components/customers/MarketingInsights";
import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { RequireCustomerToggle } from "@/components/customers/RequireCustomerToggle";
import { getRequireCustomerOnSale } from "@/lib/actions/marketing";
import { getMarketingInsights } from "@/lib/actions/marketing";
import { SEGMENTS, type SegmentId } from "@/lib/marketing";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { listCustomers, listCustomersToContact, listUpcomingBirthdays } from "@/lib/actions/customers";
import { formatDateOnly } from "@/lib/format";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  const { grupo } = await searchParams;
  const activeSegment = SEGMENTS.find((s) => s.id === grupo)?.id ?? null;
  const requireCustomer = await getRequireCustomerOnSale();
  const [session, allCustomers, toContact, birthdays, insights] = await Promise.all([
    requireSectionAccess("customers"),
    listCustomers(),
    listCustomersToContact(),
    listUpcomingBirthdays(30),
    getMarketingInsights(),
  ]);
  const segmentOfId = new Map(insights.customers.map((c) => [c.id, c.segment as SegmentId]));
  const customers = activeSegment ? allCustomers.filter((c) => segmentOfId.get(c.id) === activeSegment) : allCustomers;
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="kr-eyebrow">Clientes y seguimiento</p>
        <h1 className="kr-h1">Marketing</h1>
        </div>
        <Button nativeButton={false} render={<Link href="/customers/new" />}>
          + Añadir cliente
        </Button>
      </div>
      <MarketingTabs active="/customers" />
      <MarketingInsights data={insights} active={activeSegment} />
      <RequireCustomerToggle initial={requireCustomer} canChange={canManage} />
      <ImportCustomers />

      {toContact.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex items-center justify-center size-6 rounded-full bg-warning/10 text-warning shrink-0">
                <AlertTriangleIcon className="size-3.5" />
              </span>
              Clientes a contactar ({toContact.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {toContact.map((c) => (
                <Link
                  key={c.id}
                  href={`/customers/${c.id}/crm`}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted transition-colors"
                >
                  <span className="font-medium">
                    {c.firstName} {c.lastName}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{c.phone}</span>
                    <Badge variant="warning">
                      {c.nextContactDate ? formatDateOnly(c.nextContactDate) : "—"}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {birthdays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <span className="flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary shrink-0">
                <CakeIcon className="size-3.5" aria-hidden />
              </span>
              Cumpleaños próximos ({birthdays.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {birthdays.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/customers/${b.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted transition-colors"
                  >
                    <span className="font-medium">{b.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{b.phone}</span>
                      <Badge variant={b.inDays === 0 ? "success" : "secondary"}>
                        {b.inDays === 0
                          ? "Hoy"
                          : `${new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", timeZone: "UTC" }).format(
                              new Date(Date.UTC(2000, b.month - 1, b.day))
                            )}`}
                      </Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CustomerTable customers={customers} canManage={canManage} businessName={session.companyName} />
    </div>
  );
}

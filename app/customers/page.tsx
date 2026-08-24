import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { listCustomers, listCustomersToContact } from "@/lib/actions/customers";
import { formatDateOnly } from "@/lib/format";
import { requireSectionAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const [session, customers, toContact] = await Promise.all([
    requireSectionAccess("customers"),
    listCustomers(),
    listCustomersToContact(),
  ]);
  const canManage = session.role === "GERENTE" || session.isSuperAdmin;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Button nativeButton={false} render={<Link href="/customers/new" />}>
          Nuevo cliente
        </Button>
      </div>

      {toContact.length > 0 && (
        <Card className="border-l-4 border-l-warning">
          <CardHeader>
            <CardTitle className="text-base">Clientes a contactar ({toContact.length})</CardTitle>
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

      <CustomerTable customers={customers} canManage={canManage} />
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { listCustomers } from "@/lib/actions/customers";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <Button nativeButton={false} render={<Link href="/customers/new" />}>
          Nuevo cliente
        </Button>
      </div>

      <CustomerTable customers={customers} />
    </div>
  );
}

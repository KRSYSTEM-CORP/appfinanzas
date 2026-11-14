import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { notFound } from "next/navigation";
import { CustomerRecordForm } from "@/components/customers/CustomerRecordForm";
import { getCustomer, updateCustomer } from "@/lib/actions/customers";
import { requireSectionAccess } from "@/lib/session";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSectionAccess("customers");
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const updateWithId = updateCustomer.bind(null, id);

  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <MarketingTabs active="/customers" />
      <h2 className="text-xl font-bold tracking-[-0.02em]">Editar ficha</h2>
      <CustomerRecordForm customer={customer} action={updateWithId} />
    </div>
  );
}

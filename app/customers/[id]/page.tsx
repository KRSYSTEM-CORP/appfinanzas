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
    <div className="flex flex-col gap-4 px-4 py-5">
      <h1 className="kr-h1">Editar cliente</h1>
      <CustomerRecordForm customer={customer} action={updateWithId} />
    </div>
  );
}

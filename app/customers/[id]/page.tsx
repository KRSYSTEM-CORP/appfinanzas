import { notFound } from "next/navigation";
import { CustomerRecordForm } from "@/components/customers/CustomerRecordForm";
import { getCustomer, updateCustomer } from "@/lib/actions/customers";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const updateWithId = updateCustomer.bind(null, id);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Editar cliente</h1>
      <CustomerRecordForm customer={customer} action={updateWithId} />
    </div>
  );
}

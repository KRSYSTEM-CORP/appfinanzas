import { CustomerRecordForm } from "@/components/customers/CustomerRecordForm";
import { createCustomer } from "@/lib/actions/customers";

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Nuevo cliente</h1>
      <CustomerRecordForm action={createCustomer} />
    </div>
  );
}

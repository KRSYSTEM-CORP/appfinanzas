import { CustomerRecordForm } from "@/components/customers/CustomerRecordForm";
import { createCustomer } from "@/lib/actions/customers";

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <h1 className="kr-h1">Nuevo cliente</h1>
      <CustomerRecordForm action={createCustomer} />
    </div>
  );
}

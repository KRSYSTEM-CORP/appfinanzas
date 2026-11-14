import { MarketingTabs } from "@/components/customers/MarketingTabs";
import { CustomerRecordForm } from "@/components/customers/CustomerRecordForm";
import { createCustomer } from "@/lib/actions/customers";

export default function NewCustomerPage() {
  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <MarketingTabs active="/customers" />
      <h2 className="text-xl font-bold tracking-[-0.02em]">Añadir cliente</h2>
      <CustomerRecordForm action={createCustomer} />
    </div>
  );
}

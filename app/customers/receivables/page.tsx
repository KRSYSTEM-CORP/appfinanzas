import { MarketingTabs } from "@/components/customers/MarketingTabs";
import ReceivablesPage from "@/app/accounting/receivables/page";

export const dynamic = "force-dynamic";

// Cuentas por cobrar vive dentro de Marketing (todo lo de clientes, en un solo módulo).
export default async function MarketingReceivablesPage(props: React.ComponentProps<typeof ReceivablesPage>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="px-4 pt-5">
        <MarketingTabs active="/customers/receivables" />
      </div>
      <ReceivablesPage {...props} />
    </div>
  );
}

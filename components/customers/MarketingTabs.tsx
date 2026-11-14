import { PageHeader } from "@/components/shared/PageHeader";
import { SubTabs } from "@/components/shared/GroupTabs";
import { Pill } from "@/components/shared/Pills";

const TABS = [
  { id: "/customers", href: "/customers", label: "Clientes" },
  { id: "/customers/promotions", href: "/customers/promotions", label: "Promociones" },
  { id: "/customers/receivables", href: "/customers/receivables", label: "Cuentas por cobrar" },
] as const;

// Cabecera de Marketing (preview 05 · #mkt) con la pill CRM y las sub-pestañas: todo lo de clientes vive aquí.
export function MarketingTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <>
      <PageHeader eyebrow="Clientes, promociones y cumpleaños" title="Marketing">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="val">CRM</Pill>
        </div>
      </PageHeader>
      <SubTabs label="Marketing" items={[...TABS]} active={active} />
    </>
  );
}

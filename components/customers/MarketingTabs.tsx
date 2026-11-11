import Link from "next/link";

const TABS = [
  { href: "/customers", label: "Clientes" },
  { href: "/customers/promotions", label: "Promociones" },
  { href: "/customers/receivables", label: "Cuentas por cobrar" },
] as const;

// Sub-pestañas de Marketing: todo lo de clientes vive aquí.
export function MarketingTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="Marketing" className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={`inline-flex min-h-[38px] items-center rounded-[12px] border-2 px-3.5 text-[13px] font-bold ${
            t.href === active ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

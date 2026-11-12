"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BanknoteIcon, BarChart3Icon, ClipboardListIcon, FileTextIcon, LandmarkIcon, PackageIcon, SearchIcon, ShoppingCartIcon, UsersIcon, WalletIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { GroupTabs } from "@/components/shared/GroupTabs";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/finance": BarChart3Icon,
  "/accounting/sellers": UsersIcon,
  "/customers/receivables": WalletIcon,
  "/suppliers": LandmarkIcon,
  "/purchases": ShoppingCartIcon,
  "/payroll": BanknoteIcon,
  "/tax-book": FileTextIcon,
  "/inventory": PackageIcon,
  "/accounting/consumption": PackageIcon,
  "/accounting/statements": BarChart3Icon,
  "/accounting/accounts": LandmarkIcon,
  "/documents": FileTextIcon,
  "/settings": UsersIcon,
  "/billing": WalletIcon,
};

const GROUPS = [
  { value: "balance", label: "Balance", hrefs: ["/finance", "/customers/receivables"] },
  { value: "cuentas", label: "Cuentas Bancarias", hrefs: ["/accounting/accounts", "/settings"] },
  { value: "compras", label: "Compras", hrefs: ["/purchases", "/suppliers"] },
  { value: "consumo", label: "Consumo Interno", hrefs: ["/accounting/consumption"] },
  { value: "contabilidad", label: "Contabilidad", hrefs: ["/accounting/statements", "/tax-book", "/payroll", "/documents", "/billing"] },
] as const;
type GroupId = (typeof GROUPS)[number]["value"];

type AccountingSection = {
  href: string;
  title: string;
  description: string;
};

export function AccountingHub({ sections }: { sections: AccountingSection[] }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupId>("balance");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const hrefs: readonly string[] = GROUPS.find((g) => g.value === group)?.hrefs ?? [];
      return sections.filter((s) => hrefs.includes(s.href));
    }
    return sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q)
    );
  }, [sections, query, group]);

  return (
    <div className="flex flex-col gap-4">
      <GroupTabs label="Grupos de Administración" value={group} onChange={setGroup} groups={GROUPS.map((g) => ({ value: g.value, label: g.label }))} />
      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Buscar en contabilidad"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en contabilidad…"
          className="h-11 rounded-full border-transparent bg-card pl-9 shadow-(--shadow-card)"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin resultados para &quot;{query}&quot;.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((s) => {
            const Icon = ICONS[s.href] ?? ClipboardListIcon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="flex h-full flex-col gap-1.5 rounded-[19px] border-2 border-transparent bg-card p-5 shadow-(--shadow-card) transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary"
              >
                <Icon className="mb-1.5 size-[22px] text-primary" />
                <span className="text-base font-bold">{s.title}</span>
                <span className="text-[13px] text-muted-foreground">{s.description}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

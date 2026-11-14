import { BanknoteIcon, FileTextIcon, LandmarkIcon, PackageIcon, ShoppingCartIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { GroupTabs, SubTabs } from "@/components/shared/GroupTabs";
import { Pill } from "@/components/shared/Pills";
import { ADMIN_GROUPS, adminGroup, type AdminGroupId } from "@/lib/admin-nav";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { monthProgressLabel } from "@/lib/period-label";
import { todayDateString } from "@/lib/report-types";

const ICONS = {
  money: <BanknoteIcon aria-hidden />,
  bank: <LandmarkIcon aria-hidden />,
  cart: <ShoppingCartIcon aria-hidden />,
  box: <PackageIcon aria-hidden />,
  doc: <FileTextIcon aria-hidden />,
};

// Cabecera común de Administración (preview 05 · #adm): título, pills de tasa y mes, las cinco
// tarjetas de grupo y los chips de sub-pestaña. Cada sub-vista es una ruta que se pinta dentro.
export async function AdminShell({ group, sub, children }: { group: AdminGroupId; sub: string; children: React.ReactNode }) {
  const { rate, referenceCurrency, exchangeRateEnabled } = await getExchangeRateInfo();
  const g = adminGroup(group);
  const rateText =
    exchangeRateEnabled && rate
      ? `Tasa ${new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate)} Bs por ${referenceCurrency === "EUR" ? "€" : "$"}`
      : null;
  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <PageHeader eyebrow="Contabilidad renovada" title="Administración">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rateText && <Pill tone="val">{rateText}</Pill>}
          <Pill>{monthProgressLabel(todayDateString())}</Pill>
        </div>
      </PageHeader>
      <GroupTabs
        label="Grupos de Administración"
        value={group}
        groups={ADMIN_GROUPS.map((x) => ({ value: x.id, label: x.label, hint: x.hint, icon: ICONS[x.icon], href: x.subs[0].href }))}
      />
      {g.subs.length > 1 && <SubTabs label="Secciones" items={g.subs} active={sub} />}
      {children}
    </div>
  );
}

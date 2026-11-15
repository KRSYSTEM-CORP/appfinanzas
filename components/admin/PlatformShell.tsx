import { BarChart3Icon, Building2Icon, BanknoteIcon, GraduationCapIcon, MailIcon, ShieldCheckIcon, SearchIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { GroupTabs, SubTabs } from "@/components/shared/GroupTabs";
import { Pill } from "@/components/shared/Pills";
import { PLATFORM_GROUPS, groupOfSub, platformGroup } from "@/lib/platform-nav";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getPlatformExchangeRateInfo } from "@/lib/actions/billing";
import { FIELD_CONTROL } from "@/components/shared/Field";

const ICONS = {
  chart: <BarChart3Icon aria-hidden />,
  building: <Building2Icon aria-hidden />,
  money: <BanknoteIcon aria-hidden />,
  mail: <MailIcon aria-hidden />,
  learn: <GraduationCapIcon aria-hidden />,
  shield: <ShieldCheckIcon aria-hidden />,
};

// Cabecera común de la Plataforma: título, tasa BCV, búsqueda global de empresas, grupos y
// sub-pestañas. Cada submódulo es una ruta propia bajo /admin que se pinta dentro. Valida
// superadmin en el servidor (además de las acciones de datos de cada página).
export async function PlatformShell({ sub, children }: { sub: string; children: React.ReactNode }) {
  await requireSuperAdmin();
  const rate = await getPlatformExchangeRateInfo();
  const group = platformGroup(groupOfSub(sub));
  const rateText =
    rate.rate != null ? `Dólar BCV ${new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate.rate)} Bs` : null;
  return (
    <div className="flex flex-col gap-[18px] px-4 py-5">
      <PageHeader
        eyebrow="KR System"
        title="Plataforma"
        actions={
          <form action="/admin/empresas" method="get" role="search" className="relative w-full min-w-[220px] sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" type="search" placeholder="Buscar empresa o correo" aria-label="Buscar empresa o correo" className={`${FIELD_CONTROL} pl-9`} />
          </form>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {rateText && <Pill tone="val">{rateText}</Pill>}
          <Pill>Administración de las empresas que usan KR POS</Pill>
        </div>
      </PageHeader>
      <GroupTabs
        compactOnMobile
        label="Grupos de la Plataforma"
        value={group.id}
        groups={PLATFORM_GROUPS.map((x) => ({ value: x.id, label: x.label, hint: x.hint, icon: ICONS[x.icon], href: x.subs[0].href }))}
      />
      {group.subs.length > 1 && <SubTabs label="Secciones" items={group.subs} active={sub} />}
      {children}
    </div>
  );
}

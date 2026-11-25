import Link from "@/components/ui/nav-link";
import { AlertTriangleIcon, BanknoteIcon, BellIcon, Building2Icon, ClockIcon, SparklesIcon, UserPlusIcon } from "lucide-react";
import { PlatformShell } from "@/components/admin/PlatformShell";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { SectionCard, ListRow } from "@/components/shared/SectionCard";
import { Pill } from "@/components/shared/Pills";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { listPendingCreditRequests, listPendingPaymentReports } from "@/lib/actions/admin";
import { getCompanyDirectory, getMonthIncomeUsdCents, getPlatformHealth } from "@/lib/actions/platform";
import { platformKpis } from "@/lib/platform-logic";
import { formatDate, formatUSD } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlatformSummaryPage() {
  await requireSuperAdmin();
  const now = new Date();
  const [rows, reports, credits, income, health] = await Promise.all([
    getCompanyDirectory(),
    listPendingPaymentReports(),
    listPendingCreditRequests(),
    getMonthIncomeUsdCents(),
    getPlatformHealth(),
  ]);
  const k = platformKpis(rows, now, { monthIncomeUsdCents: income, pendingCreditRequests: credits.length });
  const pendingApprovals = k.pending + reports.length + credits.length;

  const alerts: { href: string; text: string; tone: "warn" | "bad" }[] = [];
  if (k.overdueOrBlocked > 0) alerts.push({ href: "/admin/cobranza", text: `${k.overdueOrBlocked} empresa(s) vencidas o bloqueadas`, tone: "bad" });
  if (k.expiring > 0) alerts.push({ href: "/admin/cobranza", text: `${k.expiring} empresa(s) vencen en los próximos 5 días`, tone: "warn" });
  if (reports.length > 0) alerts.push({ href: "/admin/aprobaciones", text: `${reports.length} pago(s) por revisar`, tone: "warn" });
  if (k.pending > 0) alerts.push({ href: "/admin/aprobaciones", text: `${k.pending} registro(s) esperan aprobación`, tone: "warn" });
  if (credits.length > 0) alerts.push({ href: "/admin/aprobaciones", text: `${credits.length} solicitud(es) de créditos IA`, tone: "warn" });
  if (health.dbSizeMb != null && health.dbSizeMb >= health.dbAlertMb) alerts.push({ href: "/admin", text: `La base de datos pesa ${health.dbSizeMb} MB (aviso desde ${health.dbAlertMb} MB)`, tone: "warn" });

  const shortcuts = [
    { href: "/admin/empresas", label: "Empresas" },
    { href: "/admin/aprobaciones", label: `Aprobaciones${pendingApprovals ? ` (${pendingApprovals})` : ""}` },
    { href: "/admin/cobranza", label: "Cobranza" },
    { href: "/admin/pagos", label: "Pagos de suscripción" },
    { href: "/admin/cupones", label: "Cupones" },
    { href: "/admin/marketing", label: "Marketing y correos" },
  ];

  return (
    <PlatformShell sub="resumen">
      <KpiGrid>
        <Kpi label="Empresas activas" value={k.active} hint={`${rows.length} registradas`} icon={<Building2Icon />} tone="ok" />
        <Kpi label="Por vencer en 5 días" value={k.expiring} icon={<ClockIcon />} tone={k.expiring ? "warn" : "ok"} />
        <Kpi label="Vencidas o bloqueadas" value={k.overdueOrBlocked} icon={<AlertTriangleIcon />} tone={k.overdueOrBlocked ? "bad" : "ok"} />
        <Kpi label="Pendientes de aprobar" value={k.pending} icon={<UserPlusIcon />} tone={k.pending ? "warn" : "ok"} />
        <Kpi label="Ingresos del mes" value={formatUSD(k.incomeUsdCents)} hint="Pagos de suscripción" icon={<BanknoteIcon />} />
        <Kpi label="Créditos IA pendientes" value={k.creditRequests} hint="Solicitudes por resolver" icon={<SparklesIcon />} tone={k.creditRequests ? "warn" : "ok"} />
      </KpiGrid>

      <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,330px),1fr))] gap-3.5">
        <SectionCard title="Alertas" subtitle="Lo que pide tu atención">
          {alerts.length === 0 ? (
            <p className="rounded-[14px] bg-muted px-4 py-6 text-center text-[13px] text-muted-foreground">Todo en orden: no hay alertas.</p>
          ) : (
            alerts.map((a) => (
              <ListRow key={a.text}>
                <div><BellIcon className="mr-1.5 inline size-3.5 align-[-2px] text-muted-foreground" aria-hidden />{a.text}</div>
                <Link href={a.href} className="text-[13px] font-bold text-primary">Ver</Link>
              </ListRow>
            ))
          )}
        </SectionCard>

        <SectionCard title="Atajos">
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((s) => (
              <Link key={s.href} href={s.href} data-kr="chip" className="inline-flex min-h-[38px] items-center rounded-[12px] bg-muted px-3.5 text-[13px] font-bold hover:bg-accent hover:text-primary">
                {s.label}
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Salud de la plataforma" subtitle="Solo lectura, con los datos que ya existen">
          <dl className="text-[13px]">
            {[
              ["Dólar BCV de la plataforma", health.bcvRate != null ? `Bs ${health.bcvRate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Sin tasa"],
              ["Última actualización de la tasa", health.bcvUpdatedAt ? formatDate(health.bcvUpdatedAt) : "—"],
              ["Tamaño de la base de datos", health.dbSizeMb != null ? `${health.dbSizeMb} MB` : "No disponible"],
              ["Empresas · usuarios", `${health.companies} · ${health.users}`],
              ["Último registro de empresa", health.lastSignupAt ? formatDate(health.lastSignupAt) : "—"],
            ].map(([a, b]) => (
              <div key={a} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
                <dt className="text-muted-foreground">{a}</dt>
                <dd className="text-right font-semibold tabular-nums">{b}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[13px] text-muted-foreground">
            <Pill>Respaldos</Pill> El sistema aún no guarda un registro del último respaldo, por eso no se muestra aquí.
          </p>
        </SectionCard>
      </div>
    </PlatformShell>
  );
}

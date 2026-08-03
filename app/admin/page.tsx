import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/reports/StatCard";
import { AdminUserTable } from "@/components/admin/AdminUserTable";
import { PlatformSettingsForm, PendingReportsTable } from "@/components/admin/PaymentReportsPanel";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import {
  listAllCompanies,
  listPendingPaymentReports,
  getPlatformSettings,
  listAnnouncementRecipients,
} from "@/lib/actions/admin";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  // See app/api/auth/clear-session/route.ts — this is a plain page render,
  // so a stale-but-signed cookie (deleted/suspended user) must be cleared
  // through the Route Handler rather than by redirecting straight to /login.
  if (!session) redirect("/api/auth/clear-session");
  if (!session.isSuperAdmin) redirect("/pos");

  const [companies, pendingReports, platformSettings, announcementRecipients] = await Promise.all([
    listAllCompanies(),
    listPendingPaymentReports(),
    getPlatformSettings(),
    listAnnouncementRecipients(),
  ]);
  // Each company's own status is its owner account's status (users[0] —
  // see listAllCompanies()), same semantics as before this was grouped.
  const owners = companies.map((c) => c.users[0]).filter(Boolean);
  const pendingCount = owners.filter((u) => u.status === "PENDING").length;
  const activeCount = owners.filter((u) => u.status === "ACTIVE").length;
  const suspendedCount = owners.filter((u) => u.status === "SUSPENDED").length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Administración de KR System</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprueba, deniega y controla el acceso de cada empresa registrada en la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pendientes de aprobación" value={String(pendingCount)} />
        <StatCard label="Usuarios activos" value={String(activeCount)} />
        <StatCard label="Suspendidos" value={String(suspendedCount)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cobro de suscripción mensual</CardTitle>
        </CardHeader>
        <CardContent>
          <PlatformSettingsForm
            initialInstructions={platformSettings.paymentInstructions}
            initialBillingExchangeRate={platformSettings.billingExchangeRate}
            initialDefaultMonthlyFeeUsdCents={platformSettings.defaultMonthlyFeeUsdCents}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reportes de pago pendientes ({pendingReports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PendingReportsTable reports={pendingReports} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Empresas registradas</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUserTable companies={companies} currentUserId={session.userId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enviar anuncio a las empresas</CardTitle>
        </CardHeader>
        <CardContent>
          <AnnouncementForm recipientCount={announcementRecipients.length} />
        </CardContent>
      </Card>
    </div>
  );
}

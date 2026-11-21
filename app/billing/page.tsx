import { MyPlanPanel } from "@/components/settings/MyPlanPanel";
import { getBillingInfo } from "@/lib/actions/billing";
import { getPlanUsage } from "@/lib/actions/plan";

export const dynamic = "force-dynamic";

// Suscripción: la misma pantalla de «Mi plan» de Ajustes (components/settings/MyPlanPanel.tsx).
// Es la página a la que llega una empresa bloqueada por pago, por eso sus acciones no redirigen a /blocked.
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan: planParam } = await searchParams;
  const [usage, info] = await Promise.all([getPlanUsage(), getBillingInfo()]);

  return (
    <div id="opciones-de-pago" className="flex scroll-mt-6 flex-col gap-4 px-4 py-5">
      <div>
        <h1 className="kr-h1">Suscripción mensual</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu plan, cómo pagarlo y el estado de tus reportes de pago.
        </p>
      </div>

      {planParam === "contabilidad" && (
        <div role="status" className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          La Contabilidad está incluida en los planes <b>Pyme</b> y <b>Corporativo</b>. Elige uno abajo para subir de plan.
        </div>
      )}

      {info.blocked && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <span className="font-medium text-destructive">Tu cuenta está bloqueada por suscripción vencida.</span>
          <span className="text-muted-foreground">
            Elige tu plan, reporta el pago y espera la confirmación de KR System para recuperar el acceso.
          </span>
        </div>
      )}

      <MyPlanPanel usage={usage} />
    </div>
  );
}

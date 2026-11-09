import Link from "next/link";
import { CheckIcon, MinusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, type PlanDef } from "@/lib/plans";
import { formatDate, formatUSD } from "@/lib/format";
import type { PlanUsage } from "@/lib/actions/plan";

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max == null ? 0 : Math.min(100, Math.round((used / max) * 100));
  const full = max != null && used >= max;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className={`tabular-nums ${full ? "font-medium text-destructive" : "text-muted-foreground"}`}>
          {used} de {max == null ? "ilimitados" : max}
        </span>
      </div>
      {max != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full rounded-full ${full ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, current }: { plan: PlanDef; current: boolean }) {
  return (
    <li className={`flex flex-col gap-2 rounded-xl border p-4 ${current ? "border-primary bg-primary/5" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{plan.label}</h3>
        {current && <Badge>Tu plan</Badge>}
      </div>
      <p className="text-2xl font-semibold tabular-nums">
        {formatUSD(plan.priceUsdCents)}
        <span className="text-sm font-normal text-muted-foreground"> /mes</span>
      </p>
      {plan.firstMonthUsdCents != null && (
        <p className="text-xs text-muted-foreground">Primer mes {formatUSD(plan.firstMonthUsdCents)} para empresas nuevas.</p>
      )}
      <ul className="flex flex-col gap-1 text-sm">
        <li>Hasta {plan.maxUsers} usuarios</li>
        <li>{plan.maxProducts == null ? "Productos ilimitados" : `Hasta ${plan.maxProducts} productos`}</li>
        <li>{plan.aiCredits > 0 ? `${plan.aiCredits} créditos de IA al mes` : "Asistente IA con créditos extra"}</li>
        <li className="flex items-center gap-1">
          {plan.accounting ? <CheckIcon className="size-4 text-success" aria-hidden /> : <MinusIcon className="size-4 text-muted-foreground" aria-hidden />}
          {plan.accounting ? "Incluye Contabilidad" : "Sin Contabilidad"}
        </li>
      </ul>
    </li>
  );
}

// «Mi plan» dentro de Ajustes: plan actual, uso de los límites, créditos de IA y
// los tres planes. Pagar o reportar un pago sigue en «Suscripción mensual».
export function MyPlanPanel({ usage }: { usage: PlanUsage }) {
  const { plan } = usage;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Plan actual</p>
          <p className="text-xl font-semibold">
            {plan.label} <span className="text-base font-normal text-muted-foreground">· {formatUSD(plan.priceUsdCents)}/mes</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {usage.isExempt
              ? "Tu empresa está exonerada de mensualidades."
              : usage.nextPaymentDueDate
                ? `Próximo pago: ${formatDate(usage.nextPaymentDueDate)}. Se paga en bolívares a la tasa BCV del día.`
                : "Aún no tienes fecha de pago: estás en tu periodo de prueba."}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/billing" />}>
          Pagar o reportar pago
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <Usage label="Usuarios activos" used={usage.usedUsers} max={plan.maxUsers} />
        <Usage label="Productos" used={usage.usedProducts} max={plan.maxProducts} />
        <div className="flex flex-col gap-1 md:col-span-2">
          <div className="flex items-baseline justify-between text-sm">
            <span>Créditos de IA disponibles</span>
            <span className="tabular-nums text-muted-foreground">{usage.creditsLeft}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Preguntar es gratis; aplicar un cambio propuesto cuesta 5 créditos.{" "}
            <Link href="/assistant" className="text-primary underline underline-offset-2">
              Comprar créditos
            </Link>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Planes</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <PlanCard key={p.id} plan={p} current={p.id === plan.id} />
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Para cambiar de plan escribe al soporte de KR System:{" "}
          <a href="https://wa.me/19045796156" className="text-primary underline underline-offset-2">
            WhatsApp +1 (904) 579-6156
          </a>
          .
        </p>
      </div>
    </div>
  );
}

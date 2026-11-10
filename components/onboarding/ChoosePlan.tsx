"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, type PlanId } from "@/lib/plans";
import { formatUSD } from "@/lib/format";
import { chooseInitialPlan } from "@/lib/actions/plan";

const ORDER: PlanId[] = ["EMPRENDE", "PYME", "CORPORATIVO"];

export function ChoosePlan({ trialDays, companyName }: { trialDays: number; companyName: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<PlanId>("PYME");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setError(null);
    start(async () => {
      const r = await chooseInitialPlan(selected);
      if (r.success) router.replace("/home");
      else setError(r.error);
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-6 p-5 py-10">
      <header className="text-center">
        <p className="kr-eyebrow">Bienvenido a KR POS · {companyName}</p>
        <h1 className="mt-1 kr-h1">Elige tu plan para empezar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {trialDays} días gratis. Al terminar, tu plan se renueva y lo pagas a la tasa BCV del día. Los límites se cuentan desde hoy.
        </p>
      </header>
      <ul className="grid gap-4 md:grid-cols-3" role="radiogroup" aria-label="Planes">
        {ORDER.map((id) => {
          const p = PLANS[id];
          const on = selected === id;
          return (
            <li key={id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSelected(id)}
                className={`flex h-full w-full flex-col gap-3 rounded-[20px] bg-card p-5 text-left shadow-(--shadow-card) transition-shadow ${on ? "ring-2 ring-primary" : "ring-1 ring-border"}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">{p.label}</h2>
                  {id === "PYME" && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">Popular</span>}
                </div>
                <p className="text-3xl font-bold tabular-nums">
                  {formatUSD(p.priceUsdCents)}
                  <span className="text-sm font-normal text-muted-foreground"> /mes</span>
                </p>
                {p.firstMonthUsdCents != null && (
                  <p className="text-xs font-medium text-success">Primer mes a {formatUSD(p.firstMonthUsdCents)}</p>
                )}
                <ul className="mt-1 flex flex-col gap-1.5 text-sm">
                  {[
                    `${p.maxUsers} usuarios`,
                    p.maxProducts == null ? "Productos ilimitados" : `Hasta ${p.maxProducts} productos`,
                    p.aiCredits > 0 ? `${p.aiCredits} créditos de IA al mes` : "Asistente IA con créditos aparte",
                    p.accounting ? "Contabilidad incluida" : "Sin contabilidad",
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2">
                      <CheckIcon className="size-4 shrink-0 text-success" aria-hidden /> {t}
                    </li>
                  ))}
                </ul>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-center text-sm text-destructive">{error}</p>}
      <div className="flex justify-center">
        <Button size="lg" disabled={pending} onClick={confirm}>
          {pending ? "Guardando..." : `Empezar con ${PLANS[selected].label}`}
        </Button>
      </div>
    </main>
  );
}

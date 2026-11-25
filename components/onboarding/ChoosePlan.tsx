"use client";

// Elegir plan al registrarse: misma pantalla de planes que «Mi plan» en Ajustes
// (components/settings/MyPlanPanel.tsx, vista «Planes»): mismas tarjetas, estilos (my-plan.css),
// textos y datos (lib/plans.ts). No incluye la recarga de créditos, que solo aplica con plan elegido.
import "@/components/settings/my-plan.css";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, StarIcon } from "lucide-react";
import { PLANS, recommendPlan, usersText, type PlanId } from "@/lib/plans";
import { chooseInitialPlan } from "@/lib/actions/plan";
import { Support } from "@/components/settings/MyPlanPanel";

const nf = (n: number, d = 2) => n.toLocaleString("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (cents: number, d = 0) => `$${nf(cents / 100, d)}`;

export function ChoosePlan({ trialDays, companyName }: { trialDays: number; companyName: string }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Cliente nuevo: 1 usuario creado y sin productos; sin pago aprobado, así que aplica el primer mes.
  const rec = recommendPlan(1, 0);
  const firstMonth = true;
  const emprende = PLANS.EMPRENDE;

  function confirm(id: PlanId) {
    setError(null);
    setChosen(id);
    start(async () => {
      const r = await chooseInitialPlan(id);
      if (r.success) router.replace("/home");
      else {
        setError(r.error);
        setChosen(null);
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center gap-6 p-5 py-10">
      <header className="text-center">
        <p className="kr-eyebrow">Bienvenido a KR POS · {companyName}</p>
        <h1 className="mt-1 kr-h1">Elige tu plan para empezar</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {trialDays} días gratis. Al terminar, tu plan se renueva y lo pagas a la tasa BCV del día. Los límites se cuentan desde hoy.
        </p>
      </header>
      <div className="kp">
        <div className="kp-card kp-promo">
          <span className="kp-sico"><StarIcon aria-hidden /></span>
          <div style={{ flex: 1 }}>
            <b>Tu bienvenida tiene beneficios</b>
            <div className="kp-muted">
              {trialDays} días gratis · el primer mes de {emprende.label} cuesta {usd(emprende.firstMonthUsdCents ?? emprende.priceUsdCents, 2)} · desde el 2.º mes pagas {usd(emprende.priceUsdCents, 2)} al mes.
            </div>
          </div>
        </div>
        <div className="kp-grid kp-plans">
          {Object.values(PLANS).map((p) => {
            const isRec = p.id === rec.id;
            return (
              <article key={p.id} className={`kp-card kp-plan2${isRec ? " rec" : ""}`}>
                {isRec && <span className="kp-ribbon">Recomendado para ti</span>}
                <h3>{p.label}</h3>
                <p className="kp-muted" style={{ margin: 0 }}>{p.tagline}</p>
                <div className="kp-pr">
                  <b className="kp-mono">
                    {p.firstMonthUsdCents != null && firstMonth ? (
                      <>
                        <s>{usd(p.priceUsdCents, 2)}</s> {usd(p.firstMonthUsdCents, 2)}
                        <span className="kp-pill ok">Solo el primer mes</span>
                        <small>Luego pagas {usd(p.priceUsdCents, 2)} al mes</small>
                      </>
                    ) : (
                      usd(p.priceUsdCents, 2)
                    )}
                  </b>
                  <span>/ mes</span>
                </div>
                <div className="kp-muted" style={{ fontSize: 13 }}>
                  {usersText(p)} · {p.maxProducts == null ? "productos ilimitados" : `${nf(p.maxProducts, 0)} productos`}
                  {p.aiCredits ? ` · ${p.aiCredits} créditos IA` : ""}
                </div>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}><CheckIcon aria-hidden strokeWidth={3} />{f}</li>
                  ))}
                </ul>
                <button type="button" className={`kp-btn${isRec ? " primary" : ""}`} disabled={pending} onClick={() => confirm(p.id)}>
                  {pending && chosen === p.id ? "Guardando..." : `Elegir ${p.label}`}
                </button>
              </article>
            );
          })}
        </div>
        {error && <p className="kp-note" role="alert" style={{ textAlign: "center", color: "var(--destructive)" }}>{error}</p>}
        <p className="kp-note">Los límites de usuarios y productos se cuentan desde el momento en que eliges tu plan.</p>
        <Support />
      </div>
    </main>
  );
}

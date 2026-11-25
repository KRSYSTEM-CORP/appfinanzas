"use client";

import Link from "@/components/ui/nav-link";
import { Button } from "@/components/ui/button";
import { AI_ASK_COST, AI_BIG_COST } from "@/lib/assistant";
import { useAssistantCredits } from "./AssistantCredits";
import type { CreditRequestRow } from "@/lib/actions/assistant";
import { formatUSD } from "@/lib/format";

const STATUS: Record<string, string> = { PENDING: "En revisión", APPROVED: "Aprobada", REJECTED: "Rechazada" };

export function BuyCredits({ requests }: { requests: CreditRequestRow[] }) {
  const { creditsLeft } = useAssistantCredits();
  return (
    <section className="relative flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <header className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h3 className="text-base font-bold">Tus créditos</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {AI_ASK_COST} crédito por consulta · {AI_BIG_COST} créditos por documento o consulta grande
          </p>
        </div>
      </header>
      <div className="relative mx-auto mb-1 mt-1 size-[170px]">
        <svg viewBox="0 0 128 128" className="size-full" role="img" aria-label={`${creditsLeft} créditos disponibles`}>
          <circle cx="64" cy="64" r="54" fill="none" stroke="var(--border)" strokeWidth="12" />
          <circle cx="64" cy="64" r="54" fill="none" stroke="var(--primary)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${creditsLeft > 0 ? 2 * Math.PI * 54 : 0} ${2 * Math.PI * 54}`} transform="rotate(-90 64 64)" />
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <b className="text-[40px] leading-none tracking-[-0.04em] tabular-nums">{creditsLeft}</b>
          <small className="font-semibold text-muted-foreground">disponibles</small>
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Recargas con el mismo proceso de tu suscripción: eliges el paquete, pagas por los mismos medios, subes el comprobante y
        el administrador de KR System lo aprueba. Los créditos extra no vencen.
      </p>
      <Button nativeButton={false} render={<Link href="/settings?tab=plan&vista=recarga" />} className="w-fit">
        Comprar créditos
      </Button>
      {requests.length > 0 && (
        <ul>
          {requests.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2.5 border-b py-2.5 text-sm last:border-b-0">
              <span>{r.credits} créditos · {formatUSD(r.priceCents)}</span>
              <span className={`rounded-full px-2.5 py-[3px] text-xs font-bold ${r.status === "APPROVED" ? "bg-success/14 text-success" : r.status === "REJECTED" ? "bg-destructive/12 text-destructive" : "bg-warning/18 text-warning"}`}>
                {STATUS[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

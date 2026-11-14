"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AI_PACKS } from "@/lib/assistant";
import { requestCreditPack, type CreditRequestRow } from "@/lib/actions/assistant";
import { formatUSD } from "@/lib/format";

const STATUS: Record<string, string> = { PENDING: "En revisión", APPROVED: "Aprobada", REJECTED: "Rechazada" };

export function BuyCredits({ requests, creditsLeft, applyCost }: { requests: CreditRequestRow[]; creditsLeft: number; applyCost: number }) {
  const router = useRouter();
  const [credits, setCredits] = useState<number>(AI_PACKS[1].credits);
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await requestCreditPack(credits, reference);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Solicitud enviada. Los créditos se suman cuando confirmemos tu pago.");
      setReference("");
      router.refresh();
    });
  }

  return (
    <section className="relative flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <header className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h3 className="text-base font-bold">Tus créditos</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Cada uso del asistente cuesta {applyCost} créditos</p>
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
      <h3 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">¿Se te acabaron los créditos?</h3>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">
          Paga el paquete por los mismos medios de tu suscripción (los datos están en Facturación) y escribe aquí la
          referencia. Los créditos extra no vencen.
        </p>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(92px,1fr))" }} role="radiogroup" aria-label="Paquete de créditos">
          {AI_PACKS.map((p) => (
            <button
              key={p.credits}
              type="button"
              role="radio"
              aria-checked={credits === p.credits}
              onClick={() => setCredits(p.credits)}
              className={`flex flex-col items-center gap-0.5 rounded-[18px] border-2 px-1.5 py-3.5 transition-colors ${credits === p.credits ? "border-primary bg-primary/12" : "border-transparent bg-muted"}`}
            >
              <b className="text-[26px] tracking-[-0.03em] tabular-nums">{p.credits}</b>
              <small className="text-muted-foreground">créditos</small>
              <span className="font-bold">{formatUSD(p.priceCents)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Referencia del pago"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Referencia o comprobante del pago"
            maxLength={200}
            className="max-w-sm"
          />
          <Button type="submit" disabled={isPending || reference.trim().length < 3}>
            Enviar solicitud
          </Button>
        </div>
      </form>
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

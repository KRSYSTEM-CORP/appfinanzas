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

export function BuyCredits({ requests }: { requests: CreditRequestRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">¿Se te acabaron los créditos?</p>
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? "Cerrar" : "Comprar créditos"}
        </Button>
      </div>
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Paga el paquete por los mismos medios de tu suscripción (los datos están en Facturación) y escribe aquí la
            referencia. Los créditos extra no vencen.
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Paquete de créditos">
            {AI_PACKS.map((p) => (
              <button
                key={p.credits}
                type="button"
                role="radio"
                aria-checked={credits === p.credits}
                onClick={() => setCredits(p.credits)}
                className={`rounded-lg border px-3 py-2 text-left ${credits === p.credits ? "border-primary bg-primary/10" : ""}`}
              >
                <span className="block font-semibold tabular-nums">{p.credits} créditos</span>
                <span className="text-xs text-muted-foreground">{formatUSD(p.priceCents)}</span>
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
            <Button type="submit" size="sm" disabled={isPending || reference.trim().length < 3}>
              Enviar solicitud
            </Button>
          </div>
        </form>
      )}
      {requests.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {requests.map((r) => (
            <li key={r.id}>
              {r.credits} créditos · {formatUSD(r.priceCents)} · {STATUS[r.status] ?? r.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

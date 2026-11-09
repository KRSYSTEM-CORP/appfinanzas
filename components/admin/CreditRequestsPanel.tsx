"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate, formatUSD } from "@/lib/format";
import { resolveCreditRequest } from "@/lib/actions/admin";

type Row = { id: string; credits: number; priceCents: number; reference: string; createdAt: Date; company: { name: string } };

export function CreditRequestsPanel({ requests }: { requests: Row[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function resolve(id: string, approve: boolean) {
    startTransition(async () => {
      const r = await resolveCreditRequest(id, approve);
      if (!r.success) toast.error(r.error);
      else {
        toast.success(approve ? "Créditos sumados a la empresa." : "Solicitud rechazada.");
        router.refresh();
      }
    });
  }

  if (requests.length === 0) return <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>;
  return (
    <ul className="flex flex-col divide-y">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.company.name}</p>
            <p className="text-xs text-muted-foreground">
              {r.credits} créditos · {formatUSD(r.priceCents)} · {formatDate(r.createdAt)} · Ref: {r.reference}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={() => resolve(r.id, true)}>
              Aprobar
            </Button>
            <Button size="sm" variant="outline" disabled={isPending} onClick={() => resolve(r.id, false)}>
              Rechazar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

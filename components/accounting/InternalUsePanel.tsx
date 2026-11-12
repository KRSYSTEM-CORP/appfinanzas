"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InternalUseButton } from "@/components/inventory/InternalUseButton";
import { deleteInternalUse, type InternalUseRow } from "@/lib/actions/products";

const KIND: Record<string, string> = { SOCIO: "Socio", PERSONAL: "Personal" };

export function InternalUsePanel({
  rows,
  products,
}: {
  rows: InternalUseRow[];
  products: { id: string; name: string; stock: number }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const units = rows.reduce((n, r) => n + r.quantity, 0);
  const cost = rows.reduce((n, r) => n + r.costCents, 0);
  const byWho = new Map<string, number>();
  for (const r of rows) byWho.set(r.who, (byWho.get(r.who) ?? 0) + r.costCents);
  const top = [...byWho.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = top[0]?.[1] || 1;

  function remove(id: string) {
    if (!window.confirm("¿Eliminar este retiro? La mercancía vuelve al inventario.")) return;
    start(async () => {
      await deleteInternalUse(id);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Retiros" value={String(rows.length)} />
        <Kpi label="Unidades" value={String(units)} />
        <Kpi label="Costo" value={`$${(cost / 100).toFixed(2)}`} />
      </div>
      <div className="flex justify-end">
        <InternalUseButton products={products} />
      </div>
      {top.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <p className="font-bold">Quién retira más</p>
          {top.map(([who, c]) => (
            <div key={who} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate">{who}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (c / max) * 100)}%` }} />
              </div>
              <span className="w-16 text-right tabular-nums">${(c / 100).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay retiros de consumo interno.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-[19px] bg-card p-3 shadow-(--shadow-card)">
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-bold">
                  {r.quantity} × {r.productName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.kind ? `${KIND[r.kind]} · ` : ""}
                  {r.who} · {new Date(r.date).toLocaleDateString("es-VE")}
                  {r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <span className="text-sm tabular-nums">${(r.costCents / 100).toFixed(2)}</span>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(r.id)}>
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

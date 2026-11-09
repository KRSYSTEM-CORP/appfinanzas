"use client";

import { useState } from "react";
import { LockIcon, PackageIcon, ReceiptIcon, StoreIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EnterBranchDialog } from "@/components/branches/EnterBranchDialog";
import { formatCurrencyCents } from "@/lib/currencies";
import type { BranchSummary } from "@/lib/actions/branches";

export function BranchCards({
  summaries,
  currency,
  currentBranchId,
}: {
  summaries: BranchSummary[];
  currency: string;
  currentBranchId: string | null;
}) {
  const [target, setTarget] = useState<{ id: string | null; name: string } | null>(null);
  const totalCents = summaries.filter((s) => s.isActive).reduce((a, s) => a + s.salesTodayCents, 0);

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s) => {
          const here = s.id === currentBranchId;
          return (
            <li key={s.id}>
              <Card className={here ? "border-primary" : undefined}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <StoreIcon className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {!s.isActive ? "Inactiva" : here ? "Estás aquí" : "Activa"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-muted p-2">
                      <dt className="flex items-center justify-center gap-1 text-muted-foreground">
                        <ReceiptIcon className="size-3" aria-hidden /> Hoy
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{formatCurrencyCents(currency, s.salesTodayCents)}</dd>
                      <dd className="text-muted-foreground">{s.salesToday} ventas</dd>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <dt className="flex items-center justify-center gap-1 text-muted-foreground">
                        <PackageIcon className="size-3" aria-hidden /> Productos
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{s.products}</dd>
                    </div>
                    <div className="rounded-lg bg-muted p-2">
                      <dt className="flex items-center justify-center gap-1 text-muted-foreground">
                        <UsersIcon className="size-3" aria-hidden /> Personal
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{s.users}</dd>
                    </div>
                  </dl>
                  {s.isActive && !here && (
                    <Button size="sm" variant="outline" onClick={() => setTarget({ id: s.id, name: s.name })}>
                      <LockIcon className="size-3.5" aria-hidden /> Entrar con clave
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm">
        <p>
          Ventas de hoy en todas las sedes:{" "}
          <b className="tabular-nums">{formatCurrencyCents(currency, totalCents)}</b>
        </p>
        {currentBranchId !== null && (
          <Button size="sm" variant="outline" onClick={() => setTarget({ id: null, name: "Todas las sucursales" })}>
            <LockIcon className="size-3.5" aria-hidden /> Ver todas con clave
          </Button>
        )}
      </div>
      {target && <EnterBranchDialog target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

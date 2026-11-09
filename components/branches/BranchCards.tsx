"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, PackageIcon, ReceiptIcon, StoreIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EnterBranchDialog } from "@/components/branches/EnterBranchDialog";
import { formatCurrencyCents } from "@/lib/currencies";
import { setBranchGoal, type BranchSummary } from "@/lib/actions/branches";

function GoalEditor({ branchId, goalCents, currency }: { branchId: string; goalCents: number | null; currency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(goalCents != null ? String(goalCents / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  void currency;
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-primary underline underline-offset-4">
        {goalCents != null ? "Cambiar meta" : "Definir meta de ventas del mes"}
      </button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Meta de ventas del mes"
        className="h-9 w-28 rounded-full border-[1.5px] border-input bg-card px-3 text-sm outline-none focus-visible:border-ring"
      />
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setBranchGoal(branchId, value.trim() === "" ? null : Number(value));
            if (r.success) {
              setEditing(false);
              setError(null);
              router.refresh();
            } else setError(r.error ?? "No se pudo guardar");
          })
        }
      >
        Guardar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancelar
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

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

  const active = summaries.filter((s) => s.isActive);
  const ordersToday = active.reduce((a, s) => a + s.salesToday, 0);
  const best = active.reduce<BranchSummary | null>((b, s) => (b == null || s.salesTodayCents > b.salesTodayCents ? s : b), null);
  const kpis = [
    { label: "Ventas de hoy en la red", value: formatCurrencyCents(currency, totalCents), sub: "Todas las sedes activas" },
    { label: "Pedidos hoy", value: String(ordersToday), sub: `${active.length} ${active.length === 1 ? "sede activa" : "sedes activas"}` },
    { label: "Mejor sede hoy", value: best && best.salesTodayCents > 0 ? best.name : "—", sub: best && best.salesTodayCents > 0 ? formatCurrencyCents(currency, best.salesTodayCents) : "Aún sin ventas" },
  ];

  const alerts: { tone: "warn" | "info"; text: string }[] = [
    ...active.filter((s) => s.lowStock > 0).map((s) => ({ tone: "warn" as const, text: `${s.name} tiene ${s.lowStock} ${s.lowStock === 1 ? "producto" : "productos"} con stock bajo.` })),
    ...active.filter((s) => s.salesToday === 0).map((s) => ({ tone: "info" as const, text: `${s.name} aún no registra ventas hoy.` })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-(--shadow-card)">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <LockIcon className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">
          <b className="text-foreground">Resumen de toda la red.</b> Para entrar a una sede, abrir su caja o ver su ficha necesitas la clave de su administrador.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{k.label}</p>
            <p className="mt-1 truncate text-3xl font-bold tabular-nums tracking-tight">{k.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      {alerts.length > 0 && (
        <section className="rounded-[20px] bg-card p-5 shadow-(--shadow-card)">
          <h2 className="text-base font-bold">Lo que no puede esperar</h2>
          <p className="mb-2 text-xs text-muted-foreground">Alertas de toda la red</p>
          <ul className="flex flex-col divide-y">
            {alerts.map((a) => (
              <li key={a.text} className="flex items-center gap-3 py-3 text-sm">
                <span className={`size-2 shrink-0 rounded-full ${a.tone === "warn" ? "bg-warning" : "bg-primary"}`} aria-hidden />
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map((s) => {
          const here = s.id === currentBranchId;
          return (
            <li key={s.id}>
              <Card className={here ? "ring-2 ring-primary" : undefined}>
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
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${!s.isActive ? "bg-muted text-muted-foreground" : here ? "bg-primary/10 text-primary" : "bg-success/14 text-success"}`}>
                      {!s.isActive ? "Inactiva" : here ? "Operando aquí" : "Activa"}
                    </span>
                    {s.lowStock > 0 && (
                      <span className="rounded-full bg-warning/18 px-2.5 py-0.5 text-xs font-semibold text-warning">
                        {s.lowStock} {s.lowStock === 1 ? "alerta de stock" : "alertas de stock"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Ventas · mes</p>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">{formatCurrencyCents(currency, s.salesMonthCents)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                      <p className="text-lg font-bold tabular-nums">{s.salesMonth}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-3">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-muted-foreground">Ganancia est. del mes</span>
                      <b className={`tabular-nums ${s.profitMonthCents < 0 ? "text-destructive" : "text-success"}`}>{formatCurrencyCents(currency, s.profitMonthCents)}</b>
                    </div>
                    {s.goalCents != null && s.goalCents > 0 && (
                      <>
                        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                          <span>Meta de ventas del mes</span>
                          <span className="tabular-nums">
                            {formatCurrencyCents(currency, s.salesMonthCents)} / {formatCurrencyCents(currency, s.goalCents)} · {Math.round((s.salesMonthCents / s.goalCents) * 100)} %
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Meta de ${s.name}`} aria-valuenow={Math.min(100, Math.round((s.salesMonthCents / s.goalCents) * 100))} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (s.salesMonthCents / s.goalCents) * 100)}%` }} />
                        </div>
                      </>
                    )}
                    {s.isActive && <GoalEditor branchId={s.id} goalCents={s.goalCents} currency={currency} />}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-muted p-2.5">
                      <dt className="flex items-center justify-center gap-1 text-muted-foreground">
                        <ReceiptIcon className="size-3" aria-hidden /> Hoy
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{formatCurrencyCents(currency, s.salesTodayCents)}</dd>
                      <dd className="text-muted-foreground">{s.salesToday} ventas</dd>
                    </div>
                    <div className="rounded-xl bg-muted p-2.5">
                      <dt className="flex items-center justify-center gap-1 text-muted-foreground">
                        <PackageIcon className="size-3" aria-hidden /> Productos
                      </dt>
                      <dd className="mt-0.5 font-semibold tabular-nums">{s.products}</dd>
                    </div>
                    <div className="rounded-xl bg-muted p-2.5">
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[20px] bg-card p-4 text-sm shadow-(--shadow-card)">
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

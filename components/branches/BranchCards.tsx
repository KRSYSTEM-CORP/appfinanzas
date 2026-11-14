"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, LockIcon, MapPinIcon, ShoppingCartIcon, StarIcon, StoreIcon, TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconTile } from "@/components/ui/icon-tile";
import { EnterBranchDialog } from "@/components/branches/EnterBranchDialog";
import { formatCurrencyCents } from "@/lib/currencies";
import { setBranchGoal, setBranchKey, type BranchSummary } from "@/lib/actions/branches";

function KeyEditor({ branchId }: { branchId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-primary underline underline-offset-4">
        Clave de la sede
      </button>
    );
  function save(key: string | null) {
    start(async () => {
      const r = await setBranchKey(branchId, key);
      if (r.success) {
        setEditing(false);
        setValue("");
        setError(null);
        router.refresh();
      } else setError(r.error ?? "No se pudo guardar");
    });
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
        aria-label="Clave de 4 dígitos"
        placeholder="4 dígitos"
        className="h-9 w-24 rounded-full border-[1.5px] border-input bg-card px-3 text-sm outline-none focus-visible:border-ring"
      />
      <Button size="sm" disabled={pending || value.length !== 4} onClick={() => save(value)}>
        Guardar
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => save(null)}>
        Quitar clave
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
        Cancelar
      </Button>
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}

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
  const monthSales = active.reduce((t, x) => t + x.salesMonthCents, 0);
  const monthProfit = active.reduce((t, x) => t + x.profitMonthCents, 0);
  const monthOrders = active.reduce((t, x) => t + x.salesMonth, 0);
  const bestMonth = active.reduce<BranchSummary | null>((b, x) => (b == null || x.salesMonthCents > b.salesMonthCents ? x : b), null);
  const kpis = [
    { label: "Ventas de la red", value: formatCurrencyCents(currency, monthSales), sub: "Mes en curso · sedes activas", Icon: BanknoteIcon, chip: "bg-primary/12 text-primary" },
    { label: "Ganancia neta estimada", value: formatCurrencyCents(currency, monthProfit), sub: monthSales > 0 ? `${Math.round((monthProfit / monthSales) * 1000) / 10} % de margen` : "Sin ventas este mes", Icon: TrendingUpIcon, chip: "bg-success/14 text-success" },
    { label: "Pedidos", value: String(monthOrders), sub: `${active.length} ${active.length === 1 ? "sede activa" : "sedes activas"}`, Icon: ShoppingCartIcon, chip: "bg-warning/18 text-warning" },
    { label: "Mejor sede", value: bestMonth && bestMonth.salesMonthCents > 0 ? bestMonth.name : "—", sub: bestMonth && bestMonth.salesMonthCents > 0 ? formatCurrencyCents(currency, bestMonth.salesMonthCents) : "Aún sin ventas", Icon: StarIcon, chip: "bg-primary/12 text-primary" },
  ];


  const alerts: { tone: "warn" | "info"; text: string; id: string }[] = [
    ...active.filter((s) => s.lowStock > 0).map((s) => ({ id: s.id, tone: "warn" as const, text: `${s.name} tiene ${s.lowStock} ${s.lowStock === 1 ? "producto" : "productos"} con stock bajo.` })),
    ...active.filter((s) => s.salesToday === 0).map((s) => ({ id: s.id, tone: "info" as const, text: `${s.name} aún no registra ventas hoy.` })),
  ];
  const entered = currentBranchId ? 1 : 0;
  const monthName = new Date().toLocaleDateString("es-VE", { month: "long" });

  return (
    <div className="flex flex-col gap-4">
      <div role="note" className="flex flex-wrap items-center gap-3 rounded-[19px] bg-card px-4 py-3.5 shadow-(--shadow-card)">
        <IconTile>
          <LockIcon className="size-[22px]" aria-hidden />
        </IconTile>
        <div className="min-w-[200px] flex-1">
          <b>Has entrado a {entered} de {summaries.length} {summaries.length === 1 ? "sede" : "sedes"}</b>
          <p className="text-[13px] text-muted-foreground">
            Ves el resumen de toda la red. Para entrar a una sede, abrir su caja o ver su ficha necesitas la clave de su administrador.
          </p>
        </div>
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))" }}>
        {kpis.map((k) => (
          <div key={k.label} className="relative flex min-h-32 flex-col gap-1.5 rounded-[19px] border-2 border-transparent bg-card p-[17px] shadow-(--shadow-card)">
            <p className="pr-11 text-xs font-semibold uppercase text-muted-foreground">{k.label}</p>
            <span className={`absolute right-3.5 top-3.5 grid size-[34px] place-items-center rounded-full ${k.chip}`} aria-hidden>
              <k.Icon className="size-[18px]" />
            </span>
            <p className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums">{k.value}</p>
            <p className="text-[13px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>
      {alerts.length > 0 && (
        <section className="relative rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <header className="mb-3">
            <h2 className="text-base font-bold">Lo que no puede esperar</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">Alertas de toda la red</p>
          </header>
          <ul>
            {alerts.map((a) => (
              <li key={a.text} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-b-0">
                <div className="flex items-start gap-2.5">
                  <span className={`inline-flex items-center rounded-full px-1.5 py-[3px] ${a.tone === "warn" ? "bg-warning/18 text-warning" : "text-foreground"}`} aria-hidden>
                    <span className="size-[7px] rounded-full bg-current" />
                  </span>
                  <span>{a.text}</span>
                </div>
                <a href={`#sede-${a.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-semibold text-primary transition-transform active:scale-[0.97]">
                  Ver sede
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ul className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}>
        {summaries.map((s) => {
          const here = s.id === currentBranchId;
          const p = s.goalCents != null && s.goalCents > 0 ? s.salesMonthCents / s.goalCents : null;
          const ringColor = p == null ? "" : p >= 0.9 ? "var(--success)" : p >= 0.6 ? "var(--primary)" : "var(--warning)";
          const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-bold whitespace-nowrap";
          const dot = <span className="size-[7px] rounded-full bg-current" aria-hidden />;
          return (
            <li key={s.id} id={`sede-${s.id}`} className="scroll-mt-4">
              <article className={`relative flex h-full min-w-0 flex-col gap-0.5 rounded-[19px] border-2 bg-card p-4 shadow-(--shadow-card) transition duration-150 hover:-translate-y-0.5 hover:shadow-(--shadow-float) ${here ? "border-primary" : "border-transparent"}`}>
                <div className="flex items-center gap-3">
                  <IconTile>
                    <StoreIcon className="size-[22px]" aria-hidden />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[17px] tracking-[-0.02em]">{s.name}</b>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinIcon className="size-[13px] shrink-0" aria-hidden />
                      {!s.isActive ? "Inactiva" : here ? "Sede donde operas" : "Sede activa"}
                    </div>
                  </div>
                </div>
                <div className="mb-1 mt-2.5 flex flex-wrap items-center gap-2">
                  {here && <span className={`${pill} bg-primary/12 font-semibold text-primary`}>Operando aquí</span>}
                  {!s.isActive && <span className={`${pill} bg-muted font-semibold text-muted-foreground`}>Inactiva</span>}
                  {s.lowStock > 0 ? (
                    <span className={`${pill} bg-warning/18 text-warning`}>{dot}{s.lowStock} {s.lowStock === 1 ? "alerta" : "alertas"} de stock</span>
                  ) : (
                    s.isActive && <span className={`${pill} bg-success/14 text-success`}>{dot}Stock al día</span>
                  )}
                </div>
                <div className="mt-1.5">
                  <small className="block text-xs font-semibold text-muted-foreground">Ventas · mes</small>
                  <b className="block text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums">{formatCurrencyCents(currency, s.salesMonthCents)}</b>
                  <small className="block text-xs font-semibold text-muted-foreground">Hoy {formatCurrencyCents(currency, s.salesTodayCents)} · {s.salesToday} {s.salesToday === 1 ? "venta" : "ventas"}</small>
                </div>
                <div className="mt-2.5 grid grid-cols-2 items-center gap-2.5">
                  <div>
                    <small className="block text-xs font-semibold text-muted-foreground">Ganancia neta est.</small>
                    <b className={`text-[17px] font-bold tabular-nums ${s.profitMonthCents < 0 ? "text-destructive" : "text-success"}`}>{formatCurrencyCents(currency, s.profitMonthCents)}</b>
                  </div>
                  <div>
                    <small className="block text-xs font-semibold text-muted-foreground">Pedidos</small>
                    <b className="text-[17px] font-bold tabular-nums">{s.salesMonth}</b>
                  </div>
                  {p != null && s.goalCents != null && (
                    <div className="col-span-full flex items-center gap-3 rounded-[14px] bg-muted px-3 py-2">
                      <svg className="size-[54px] shrink-0" viewBox="0 0 64 64" role="img" aria-label={`${Math.round(p * 100)} % de la meta`}>
                        <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="7" />
                        <circle cx="32" cy="32" r="26" fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${Math.min(1, p) * 2 * Math.PI * 26} ${2 * Math.PI * 26}`} transform="rotate(-90 32 32)" />
                        <text x="32" y="36" textAnchor="middle" style={{ fontSize: 13, fontWeight: 800, fill: "var(--foreground)" }}>{Math.round(p * 100)}%</text>
                      </svg>
                      <div>
                        <small className="block text-xs font-semibold text-muted-foreground">Meta de {monthName}</small>
                        <b className="text-[17px] font-bold tabular-nums">{formatCurrencyCents(currency, s.salesMonthCents)} / {formatCurrencyCents(currency, s.goalCents)}</b>
                      </div>
                    </div>
                  )}
                </div>
                {s.isActive && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <GoalEditor branchId={s.id} goalCents={s.goalCents} currency={currency} />
                    <KeyEditor branchId={s.id} />
                  </div>
                )}
                {s.isActive && !here && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTarget({ id: s.id, name: s.name })}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.97]"
                    >
                      <LockIcon className="size-4" aria-hidden /> Entrar con clave
                    </button>
                  </div>
                )}
              </article>
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

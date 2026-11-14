"use client";

import { useMemo, useState } from "react";
import { Building2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { RowMenu, type RowMenuItem } from "@/components/shared/RowMenu";
import { Pill } from "@/components/shared/Pills";
import { Switch } from "@/components/settings/SettingsUi";
import { EmptyCard, SelectControl, StateBadge, dayLabel, formatUSD, useAction } from "@/components/admin/platform-ui";
import { PLANS } from "@/lib/plans";
import { FEATURES } from "@/lib/features";
import {
  EMPTY_FILTERS,
  STATE_LABELS,
  companyState,
  daysUntilDue,
  filterCompanies,
  whatsappUrl,
  type CompanyFilters,
  type CompanyState,
  type DueFilter,
} from "@/lib/platform-logic";
import {
  approveUser,
  denyUser,
  deleteCompany,
  grantAiCredits,
  reactivateUser,
  recordMaintenancePayment,
  renewSubscriptionManually,
  setCompanyExempt,
  setCompanyFeatures,
  setCompanyPlan,
  suspendUser,
} from "@/lib/actions/admin";
import type { DirectoryRow } from "@/lib/actions/platform";

export type SheetKind = "approve" | "reject" | "suspend" | "reactivate" | "renew" | "plan" | "credits" | "pay" | "users" | "features" | "delete";

const STATE_OPTIONS = [{ value: "all", label: "Todos los estados" }, ...(Object.keys(STATE_LABELS) as CompanyState[]).map((s) => ({ value: s, label: STATE_LABELS[s] }))];
const PLAN_OPTIONS = [{ value: "all", label: "Todos los planes" }, ...Object.values(PLANS).map((p) => ({ value: p.id, label: p.label }))];
const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "Cualquier vencimiento" },
  { value: "today", label: "Vencen hoy" },
  { value: "soon", label: "Vencen en 1 a 5 días" },
  { value: "overdue", label: "Vencidas" },
  { value: "none", label: "Sin fecha" },
];

export function CompaniesView({ rows, currentUserId, nowIso, initialQ }: { rows: DirectoryRow[]; currentUserId: string; nowIso: string; initialQ: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [filters, setFilters] = useState<CompanyFilters>({ ...EMPTY_FILTERS, q: initialQ });
  const [sheet, setSheet] = useState<{ kind: SheetKind; id: string } | null>(null);
  const shown = useMemo(() => filterCompanies(rows, filters, now) as DirectoryRow[], [rows, filters, now]);
  const target = sheet ? rows.find((r) => r.id === sheet.id) ?? null : null;
  const { pending, run } = useAction();

  return (
    <div className="flex flex-col gap-3.5">
      <SectionCard title="Buscar y filtrar" subtitle={`${shown.length} de ${rows.length} empresas`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2.5">
          <input
            type="search"
            aria-label="Buscar por nombre o correo"
            placeholder="Nombre o correo"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className={FIELD_CONTROL}
          />
          <SelectControl label="Estado" value={filters.state} onChange={(v) => setFilters({ ...filters, state: v as CompanyFilters["state"] })} options={STATE_OPTIONS} />
          <SelectControl label="Plan" value={filters.plan} onChange={(v) => setFilters({ ...filters, plan: v })} options={PLAN_OPTIONS} />
          <SelectControl label="Vencimiento" value={filters.due} onChange={(v) => setFilters({ ...filters, due: v as DueFilter })} options={DUE_OPTIONS} />
        </div>
      </SectionCard>

      {shown.length === 0 ? (
        <EmptyCard>{rows.length === 0 ? "No hay empresas registradas todavía." : "Ninguna empresa coincide con estos filtros."}</EmptyCard>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-3.5">
          {shown.map((c) => {
            const state = companyState(c, now);
            const isSelf = c.ownerId === currentUserId;
            const wa = whatsappUrl(c.phone);
            const items: RowMenuItem[] = [];
            if (c.ownerStatus === "PENDING") {
              items.push({ label: "Aprobar", onSelect: () => setSheet({ kind: "approve", id: c.id }) }, { label: "Rechazar", onSelect: () => setSheet({ kind: "reject", id: c.id }), danger: true });
            }
            if (c.ownerStatus === "ACTIVE" && !isSelf) items.push({ label: "Suspender", onSelect: () => setSheet({ kind: "suspend", id: c.id }), danger: true });
            if (c.ownerStatus === "SUSPENDED") items.push({ label: "Reactivar", onSelect: () => setSheet({ kind: "reactivate", id: c.id }) });
            items.push({ label: "Cambiar plan", onSelect: () => setSheet({ kind: "plan", id: c.id }) }, { label: "Regalar créditos IA", onSelect: () => setSheet({ kind: "credits", id: c.id }) });
            if (c.ownerStatus === "ACTIVE" && !c.isExempt) {
              items.push({ label: "Registrar pago", onSelect: () => setSheet({ kind: "pay", id: c.id }) }, { label: "Renovar suscripción", onSelect: () => setSheet({ kind: "renew", id: c.id }) });
            }
            items.push({ label: `Ver usuarios (${c.userCount})`, onSelect: () => setSheet({ kind: "users", id: c.id }) });
            if (FEATURES.length > 0) items.push({ label: "Funciones extra", onSelect: () => setSheet({ kind: "features", id: c.id }) });
            if (wa) items.push({ label: "Escribir por WhatsApp", href: wa, external: true });
            if (c.ownerStatus === "SUSPENDED") items.push({ label: "Eliminar", onSelect: () => setSheet({ kind: "delete", id: c.id }), danger: true });
            const days = daysUntilDue(c.nextPaymentDueDate, now);
            return (
              <SectionCard key={c.id} className="flex flex-col gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="inline-flex size-[46px] flex-none items-center justify-center rounded-[14px] bg-accent text-primary">
                    <Building2Icon className="size-[22px]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate">{c.name}</b>
                    <small className="block truncate text-xs text-muted-foreground">{c.ownerEmail}</small>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StateBadge state={state} />
                      <Pill tone="val">{PLANS[c.plan as keyof typeof PLANS]?.label ?? c.plan}</Pill>
                      <Pill>{c.isExempt ? "Sin cobro" : dayLabel(days)}</Pill>
                    </div>
                  </div>
                  <RowMenu items={items} label={`Acciones de ${c.name}`} />
                </div>
                <div className="flex flex-col">
                  <SwitchRow
                    title="Activa"
                    hint={c.ownerStatus === "PENDING" ? "Pendiente de aprobar" : c.ownerStatus === "ACTIVE" ? "Puede entrar al sistema" : "Suspendida: no puede entrar"}
                    on={c.ownerStatus === "ACTIVE"}
                    disabled={pending || c.ownerStatus === "PENDING" || isSelf}
                    onChange={(v) => setSheet({ kind: v ? "reactivate" : "suspend", id: c.id })}
                  />
                  <SwitchRow
                    title="Exenta de pago"
                    hint="No se le cobra la suscripción"
                    on={c.isExempt}
                    disabled={pending || c.ownerStatus === "SUSPENDED"}
                    onChange={(v) => run(() => setCompanyExempt(c.id, v), v ? "Empresa exenta de pago" : "Se volvió a cobrar la suscripción")}
                  />
                  {FEATURES.length > 0 && (
                    <SwitchRow
                      title="Funciones extra"
                      hint={c.enabledFeatures.length ? `${c.enabledFeatures.length} activada(s)` : "Ninguna activada"}
                      on={c.enabledFeatures.length > 0}
                      disabled={pending}
                      onChange={() => setSheet({ kind: "features", id: c.id })}
                    />
                  )}
                </div>
              </SectionCard>
            );
          })}
        </div>
      )}

      {target && sheet && <CompanySheet key={`${sheet.kind}-${target.id}`} kind={sheet.kind} company={target} onClose={() => setSheet(null)} />}
    </div>
  );
}

function SwitchRow({ title, hint, on, disabled, onChange }: { title: string; hint: string; on: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t py-2">
      <div className="min-w-0">
        <b className="block text-[13px]">{title}</b>
        <small className="block text-xs text-muted-foreground">{hint}</small>
      </div>
      <Switch on={on} disabled={disabled} onChange={onChange} label={title} />
    </div>
  );
}

export function CompanySheet({ kind, company: c, onClose }: { kind: SheetKind; company: DirectoryRow; onClose: () => void }) {
  const { pending, run } = useAction();
  const [plan, setPlan] = useState<string>(c.plan);
  const [credits, setCredits] = useState("");
  const [amount, setAmount] = useState(c.monthlyFeeUsdCents != null ? String(c.monthlyFeeUsdCents / 100) : "");
  const [periodEnd, setPeriodEnd] = useState(() => {
    const d = new Date(c.nextPaymentDueDate ?? Date.now());
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [note, setNote] = useState("");
  const [typed, setTyped] = useState("");
  const [features, setFeatures] = useState<string[]>(c.enabledFeatures);

  const done = onClose;
  const confirmBtn = (label: string, onClick: () => void, opts?: { danger?: boolean; disabled?: boolean }) => (
    <Button variant={opts?.danger ? "destructive" : "default"} disabled={pending || opts?.disabled} onClick={onClick}>
      {label}
    </Button>
  );
  const head = (title: string, desc: React.ReactNode) => (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{desc}</DialogDescription>
    </DialogHeader>
  );

  let body: React.ReactNode;
  switch (kind) {
    case "approve":
      body = (
        <>
          {head(`Aprobar a ${c.name}`, "La empresa queda activa de inmediato con su período de prueba. La mensualidad es el precio de su plan.")}
          <SheetActions>
            {confirmBtn("Aprobar y activar", () => run(() => approveUser(c.ownerId, {}), "Empresa aprobada", done))}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "reject":
      body = (
        <>
          {head(`¿Rechazar a ${c.name}?`, `El usuario ${c.ownerEmail} no podrá iniciar sesión. Podrás reactivarlo después.`)}
          <SheetActions>
            {confirmBtn("Rechazar", () => run(() => denyUser(c.ownerId), "Empresa rechazada", done), { danger: true })}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "suspend":
      body = (
        <>
          {head(`¿Suspender a ${c.name}?`, `El usuario ${c.ownerEmail} dejará de poder iniciar sesión de inmediato. Puedes reactivarla cuando quieras.`)}
          <SheetActions>
            {confirmBtn("Sí, suspender", () => run(() => suspendUser(c.ownerId), "Empresa suspendida", done), { danger: true })}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "reactivate":
      body = (
        <>
          {head(`¿Reactivar a ${c.name}?`, "Volverá a poder entrar al sistema.")}
          <SheetActions>
            {confirmBtn("Reactivar", () => run(() => reactivateUser(c.ownerId), "Empresa reactivada", done))}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "renew":
      body = (
        <>
          {head(`Renovar la suscripción de ${c.name}`, "Reinicia su ciclo: el próximo pago queda en 30 días, sin registrar un monto. Si no paga al vencer, el sistema se bloquea.")}
          <SheetActions>
            {confirmBtn("Renovar", () => run(() => renewSubscriptionManually(c.id), "Suscripción renovada", done))}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "plan":
      body = (
        <>
          {head(`Plan de ${c.name}`, "Cambiar el plan también ajusta la mensualidad al precio de lista del plan.")}
          <Field label="Plan">
            <SelectControl label="Plan" value={plan} onChange={setPlan} options={Object.values(PLANS).map((p) => ({ value: p.id, label: `${p.label} · ${formatUSD(p.priceUsdCents)}` }))} />
          </Field>
          <SheetActions>
            {confirmBtn("Guardar plan", () => run(() => setCompanyPlan(c.id, plan), "Plan actualizado", done), { disabled: plan === c.plan })}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "credits":
      body = (
        <>
          {head(`Regalar créditos de IA a ${c.name}`, `Créditos extra que no vencen. Tiene ${c.aiCreditsExtra} extra y ha usado ${c.aiCreditsUsed} este mes.`)}
          <Field label="Cantidad de créditos">
            <input type="number" min={1} step={1} value={credits} onChange={(e) => setCredits(e.target.value)} className={FIELD_CONTROL} />
          </Field>
          <SheetActions>
            {confirmBtn("Regalar", () => run(() => grantAiCredits(c.id, Math.floor(Number(credits))), "Créditos otorgados", done), { disabled: !(Number(credits) >= 1) })}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "pay":
      body = (
        <>
          {head(`Registrar pago de ${c.name}`, "Confirma el pago recibido: actualiza el monto vigente y desbloquea la cuenta si estaba vencida.")}
          <Field label="Monto (USD)">
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={FIELD_CONTROL} />
          </Field>
          <Field label="Nueva fecha de vencimiento">
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={FIELD_CONTROL} />
          </Field>
          <Field label="Nota (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Transferencia ref. 001234567" className={FIELD_CONTROL} />
          </Field>
          <SheetActions>
            {confirmBtn("Registrar pago", () => run(() => recordMaintenancePayment(c.id, { amount, periodEnd, note }), "Pago registrado", done))}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "users":
      body = (
        <>
          {head(`Usuarios de ${c.name}`, `${c.userCount} cuenta(s), ${c.usersActive} activa(s).`)}
          <ul className="mt-3 flex flex-col divide-y text-sm">
            <li className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0"><b className="block truncate">{c.ownerName}</b><small className="text-xs text-muted-foreground">Dueño · {c.ownerEmail}</small></span>
              <Pill tone={c.ownerStatus === "ACTIVE" ? "ok" : "bad"}>{c.ownerStatus === "ACTIVE" ? "Activo" : c.ownerStatus === "PENDING" ? "Pendiente" : "Suspendido"}</Pill>
            </li>
            {c.employees.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0"><b className="block truncate">{e.name}</b><small className="text-xs text-muted-foreground">{e.role === "GERENTE" ? "Gerente" : "Vendedor"}</small></span>
                <Pill tone={e.status === "ACTIVE" ? "ok" : "bad"}>{e.status === "ACTIVE" ? "Activo" : "Suspendido"}</Pill>
              </li>
            ))}
          </ul>
          <SheetActions><Button variant="outline" onClick={onClose}>Cerrar</Button></SheetActions>
        </>
      );
      break;
    case "features":
      body = (
        <>
          {head(`Funciones extra de ${c.name}`, "Apartados personalizados que solo ve esta empresa.")}
          <div className="mt-3 flex flex-col">
            {FEATURES.map((f) => (
              <SwitchRow
                key={f.id}
                title={f.label}
                hint={f.description}
                on={features.includes(f.id)}
                onChange={(v) => setFeatures(v ? [...features, f.id] : features.filter((x) => x !== f.id))}
              />
            ))}
          </div>
          <SheetActions>
            {confirmBtn("Guardar", () => run(() => setCompanyFeatures(c.id, features), "Funciones actualizadas", done))}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
    case "delete":
      body = (
        <>
          {head(`¿Eliminar a ${c.name}?`, "Se borran todos sus datos (productos, clientes, presupuestos y pagos). No se puede deshacer. Solo se eliminan empresas suspendidas sin ventas, compras ni cierres.")}
          <Field label={`Escribe el nombre exacto de la empresa para confirmar`}>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={c.name} className={FIELD_CONTROL} />
          </Field>
          <SheetActions>
            {confirmBtn("Eliminar definitivamente", () => run(() => deleteCompany(c.id), "Empresa eliminada", done), { danger: true, disabled: typed.trim() !== c.name })}
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </SheetActions>
        </>
      );
      break;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{body}</DialogContent>
    </Dialog>
  );
}


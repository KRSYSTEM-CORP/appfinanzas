"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { ConfirmSheet, SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill } from "@/components/shared/Pills";
import { RowMenu } from "@/components/shared/RowMenu";
import { Note, SectionCard, TwoCol } from "@/components/shared/SectionCard";
import { deleteCustomer, updateCustomerCrm } from "@/lib/actions/customers";
import { FREQUENT_VISITS, INACTIVE_DAYS, SEGMENTS, shortDate, whatsappLink, type SegmentId } from "@/lib/marketing";
import { money } from "@/lib/money-display";
import { cn } from "@/lib/utils";

export type CrmCustomer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  notes: string | null;
  visits: number;
  spentCents: number;
  lastVisitDays: number | null;
  nextContactDate: string | null; // AAAA-MM-DD
  segment: SegmentId;
  isNew: boolean;
  birthdayThisMonth: boolean;
};
export type Birthday = { id: string; name: string; phone: string; month: number; day: number; inDays: number };

// Fondo de cada cuadrante del mapa (.qk.c1…c4 de la preview).
const QUAD: Record<SegmentId, string> = {
  campeones: "bg-[color-mix(in_srgb,var(--ok-solid)_16%,var(--card))]",
  leales: "bg-[color-mix(in_srgb,var(--primary)_14%,var(--card))]",
  riesgo: "bg-[color-mix(in_srgb,var(--warn-solid)_20%,var(--card))]",
  dormidos: "bg-muted",
};
const FILTERS = [
  { id: "todos", label: "Todos", fn: () => true },
  { id: "freq", label: "Frecuentes", fn: (c: CrmCustomer) => c.visits >= FREQUENT_VISITS },
  { id: "nuevo", label: "Nuevos", fn: (c: CrmCustomer) => c.isNew },
  { id: "inact", label: "Inactivos", fn: (c: CrmCustomer) => c.lastVisitDays != null && c.lastVisitDays > INACTIVE_DAYS },
  { id: "cum", label: "Cumpleañeros", fn: (c: CrmCustomer) => c.birthdayThisMonth },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function lastVisit(d: number | null) {
  if (d == null) return "Sin compras";
  return d === 0 ? "Hoy" : d === 1 ? "Ayer" : `hace ${d} días`;
}

// Marketing → Clientes (preview, vCli): mapa de clientes, agenda de contactos y tabla con filtros.
export function CrmView({
  customers,
  birthdays,
  currency,
  canManage,
  businessName,
  today,
}: {
  customers: CrmCustomer[];
  birthdays: Birthday[];
  currency: string;
  canManage: boolean;
  businessName: string;
  today: string;
}) {
  const router = useRouter();
  const [seg, setSeg] = useState<SegmentId | null>(null);
  const [filter, setFilter] = useState<FilterId>("todos");
  const [q, setQ] = useState("");
  const [noteFor, setNoteFor] = useState<CrmCustomer | null>(null);
  const [toDelete, setToDelete] = useState<CrmCustomer | null>(null);
  const [pending, start] = useTransition();

  const segCount = useMemo(() => Object.fromEntries(SEGMENTS.map((s) => [s.id, customers.filter((c) => c.segment === s.id).length])) as Record<SegmentId, number>, [customers]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, customers.filter(f.fn).length])) as Record<FilterId, number>, [customers]);
  const agenda = customers
    .filter((c) => c.nextContactDate && c.nextContactDate >= today)
    .sort((a, b) => (a.nextContactDate! < b.nextContactDate! ? -1 : 1))
    .slice(0, 6);
  const fn = FILTERS.find((f) => f.id === filter)!.fn;
  const needle = q.trim().toLowerCase();
  const rows = customers.filter(
    (c) =>
      fn(c) &&
      (!seg || c.segment === seg) &&
      (!needle || `${c.firstName} ${c.lastName}`.toLowerCase().includes(needle) || c.phone.includes(needle) || (c.email ?? "").toLowerCase().includes(needle))
  );
  const greet = (c: { firstName: string }) => `Hola ${c.firstName}, te escribimos de ${businessName}. `;
  const daysTo = (ymd: string) => Math.round((Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const quad = (id: SegmentId) => {
    const s = SEGMENTS.find((x) => x.id === id)!;
    return (
      <button
        key={id}
        type="button"
        aria-pressed={seg === id}
        onClick={() => setSeg(seg === id ? null : id)}
        className={cn("flex flex-col gap-0.5 rounded-[16px] border-2 p-3.5 text-left", seg === id ? "border-primary bg-accent" : cn("border-transparent", QUAD[id]))}
      >
        <b className="text-[15px]">{s.label}</b>
        <span className="text-[26px] font-extrabold tracking-[-0.03em]">{segCount[id]}</span>
        <small className="text-muted-foreground">{s.hint}</small>
      </button>
    );
  };

  function remove() {
    if (!toDelete) return;
    start(async () => {
      const r = await deleteCustomer(toDelete.id);
      if (!r.success) toast.error(r.error);
      else toast.success("Cliente eliminado");
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <TwoCol>
        <SectionCard title="Mapa de clientes" subtitle="Frecuencia de visitas y gasto · toca un cuadrante para filtrar la tabla">
          <div className="grid grid-cols-2 gap-2.5">
            {quad("riesgo")}
            {quad("campeones")}
            {quad("dormidos")}
            {quad("leales")}
          </div>
          <div className="mx-0.5 mt-1 flex justify-between text-[11px] font-semibold text-muted-foreground">
            <span>← Viene poco</span>
            <span>Viene seguido →</span>
          </div>
          <Note>Arriba gastan {money(currency, 30000, 0)} o más; abajo, menos. Frecuente = 5 visitas o más.</Note>
        </SectionCard>
        <SectionCard title="Agenda de contactos" subtitle="Próximos contactos programados">
          {agenda.length === 0 && <p className="text-[13px] text-muted-foreground">No hay contactos programados. Usa «Notas y próximo contacto» en la tabla.</p>}
          {agenda.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
              <div className="min-w-0">
                <b>
                  {c.firstName} {c.lastName}
                </b>
                <small className="block truncate text-xs text-muted-foreground">{c.notes || "Sin nota"}</small>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill tone={daysTo(c.nextContactDate!) <= 2 ? "warn" : "val"}>{shortDate(`${c.nextContactDate}T12:00:00Z`)}</Pill>
                <a href={whatsappLink(c.phone, greet(c))} target="_blank" rel="noopener noreferrer" className="rounded-full px-2 py-1.5 text-[13px] font-semibold text-primary hover:bg-muted">
                  WhatsApp
                </a>
              </div>
            </div>
          ))}
        </SectionCard>
      </TwoCol>

      {filter === "cum" && (
        <SectionCard title="Próximos cumpleaños" subtitle="Cuándo cumple cada cliente, para una promoción por WhatsApp">
          {birthdays.length === 0 && <p className="text-[13px] text-muted-foreground">Nadie cumple años en los próximos 30 días.</p>}
          {birthdays.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
              <div className="min-w-0">
                <b>{b.name}</b>
                <small className="block text-xs text-muted-foreground">
                  Cumple el {b.day} de {MONTHS[b.month - 1]}
                </small>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill tone={b.inDays === 0 ? "ok" : b.inDays <= 7 ? "warn" : "val"}>{b.inDays === 0 ? "Hoy" : `En ${b.inDays} días`}</Pill>
                <a
                  href={whatsappLink(b.phone, `¡Feliz cumpleaños, ${b.name.split(" ")[0]}! De parte de todo el equipo de ${businessName}.`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-2 py-1.5 text-[13px] font-semibold text-primary hover:bg-muted"
                >
                  WhatsApp
                </a>
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      <SectionCard flush>
        <div className="px-4 pb-2 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <h3 className="text-base font-bold tracking-[-0.015em]">Clientes{seg ? ` · ${SEGMENTS.find((s) => s.id === seg)!.label}` : ""}</h3>
            {seg && (
              <button type="button" onClick={() => setSeg(null)} className="rounded-full px-2 py-1.5 text-[13px] font-semibold text-primary hover:bg-muted">
                Quitar filtro del mapa
              </button>
            )}
          </div>
          <label className="relative mt-2.5 block">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              aria-label="Buscar cliente"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente por nombre, teléfono o correo…"
              className="min-h-[46px] w-full rounded-full border border-border bg-background pl-11 pr-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                data-kr="chip"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex min-h-[38px] items-center rounded-[12px] border-2 px-3.5 text-[13px] font-bold transition-colors",
                  filter === f.id ? "border-primary bg-accent text-primary" : "border-transparent bg-muted"
                )}
              >
                {f.label} ({counts[f.id]})
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="p-5 text-center text-muted-foreground">Ningún cliente cumple este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold text-muted-foreground [&>th]:px-3.5 [&>th]:py-[11px]">
                  <th>Cliente</th>
                  <th className="text-right">Visitas</th>
                  <th className="text-right">Gastado</th>
                  <th>Última visita</th>
                  <th>Próximo contacto</th>
                  <th>Grupo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b [&>td]:px-3.5 [&>td]:py-[11px]">
                    <td>
                      <b>
                        {c.firstName} {c.lastName}
                      </b>
                      <small className="block text-xs text-muted-foreground">{c.phone}</small>
                    </td>
                    <td className="text-right tabular-nums">{c.visits}</td>
                    <td className="text-right tabular-nums">{money(currency, c.spentCents, 0)}</td>
                    <td>{lastVisit(c.lastVisitDays)}</td>
                    <td>{c.nextContactDate ? shortDate(`${c.nextContactDate}T12:00:00Z`) : "—"}</td>
                    <td>
                      <Pill>{SEGMENTS.find((s) => s.id === c.segment)!.label}</Pill>
                    </td>
                    <td className="text-right">
                      <RowMenu
                        items={[
                          ...(canManage ? [{ label: "Editar ficha", href: `/customers/${c.id}` }, { label: "Notas y próximo contacto", onSelect: () => setNoteFor(c) }] : []),
                          { label: "Enviar WhatsApp", href: whatsappLink(c.phone, greet(c)), external: true },
                          ...(canManage ? [{ label: "Eliminar", danger: true, onSelect: () => setToDelete(c) }] : []),
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold [&>td]:px-3.5 [&>td]:py-[11px]">
                  <td>{rows.length} clientes</td>
                  <td />
                  <td className="text-right tabular-nums">{money(currency, rows.reduce((n, c) => n + c.spentCents, 0), 0)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {noteFor && <NotesSheet c={noteFor} onClose={() => setNoteFor(null)} />}
      <ConfirmSheet
        open={toDelete != null}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="¿Eliminar este cliente?"
        description={`${toDelete ? `${toDelete.firstName} ${toDelete.lastName}` : ""} se quitará del CRM. Sus ventas anteriores se conservan.`}
        confirmLabel="Sí, eliminar"
        onConfirm={remove}
        pending={pending}
      />
    </>
  );
}

function NotesSheet({ c, onClose }: { c: CrmCustomer; onClose: () => void }) {
  const router = useRouter();
  const [notes, setNotes] = useState(c.notes ?? "");
  const [date, setDate] = useState(c.nextContactDate ?? "");
  const [pending, start] = useTransition();
  function save() {
    const fd = new FormData();
    fd.set("notes", notes);
    fd.set("nextContactDate", date);
    start(async () => {
      const r = await updateCustomerCrm(c.id, fd);
      if (!r.success) toast.error(r.error);
      else {
        toast.success("Notas guardadas");
        onClose();
        router.refresh();
      }
    });
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notas y próximo contacto</DialogTitle>
          <DialogDescription>
            {c.firstName} {c.lastName}
          </DialogDescription>
        </DialogHeader>
        <Field label="Nota">
          <textarea className={cn(FIELD_CONTROL, "min-h-24 py-2.5")} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: prefiere que le escriban por la tarde" />
        </Field>
        <Field label="Próximo contacto">
          <input className={FIELD_CONTROL} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <SheetActions>
          <Button disabled={pending} onClick={save}>
            Guardar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { CalendarClockIcon, GiftIcon, HourglassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/shared/SectionCard";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill, StatusPill } from "@/components/shared/Pills";
import { EmptyCard, formatDate, useAction } from "@/components/admin/platform-ui";
import { FREE_DAYS_PRESETS, MAX_FREE_DAYS, addFreeDays, trialDaysLeft } from "@/lib/trial";
import { grantFreeDays, type TrialCompanyRow } from "@/lib/actions/trial";

type Pending = { row: TrialCompanyRow; days: number; note: string };

export function TrialDaysView({ rows, nowIso }: { rows: TrialCompanyRow[]; nowIso: string }) {
  const now = new Date(nowIso);
  const { pending, run } = useAction();
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<Pending | null>(null);

  const due = (r: TrialCompanyRow) => (r.trialEndsAt ? new Date(r.trialEndsAt) : null);
  const left = (r: TrialCompanyRow) => trialDaysLeft(due(r), now);
  const inTrial = rows.filter((r) => (left(r) ?? 0) > 0).length;
  const expired = rows.filter((r) => r.trialEndsAt && due(r)!.getTime() <= now.getTime()).length;
  const granted = rows.reduce((s, r) => s + r.freeDaysGranted, 0);

  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter((r) => r.name.toLowerCase().includes(term) || (r.ownerEmail ?? "").toLowerCase().includes(term)) : rows;

  return (
    <div className="flex flex-col gap-3.5">
      <KpiGrid>
        <Kpi label="En prueba" value={inTrial} icon={<HourglassIcon />} tone="info" />
        <Kpi label="Prueba vencida" value={expired} icon={<CalendarClockIcon />} tone={expired ? "bad" : "ok"} />
        <Kpi label="Días regalados" value={granted} icon={<GiftIcon />} tone="info" />
      </KpiGrid>
      <SectionCard title="Días gratis" subtitle="Regala días de prueba a las empresas que todavía no han pagado. Se suman a lo que les quede; si la prueba ya terminó, vuelven a entrar.">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" aria-label="Buscar empresa" className={`${FIELD_CONTROL} mb-2`} />
        {rows.length === 0 ? (
          <EmptyCard>No hay empresas en prueba: todas las nuevas ya pagaron o están exentas.</EmptyCard>
        ) : shown.length === 0 ? (
          <EmptyCard>Ninguna empresa coincide con la búsqueda.</EmptyCard>
        ) : (
          shown.map((r) => (
            <TrialRow key={r.id} row={r} left={left(r)} busy={pending} onAsk={(days, note) => setConfirm({ row: r, days, note })} />
          ))
        )}
      </SectionCard>

      {confirm && (
        <Dialog open onOpenChange={(o) => !o && setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dar +{confirm.days} días</DialogTitle>
              <DialogDescription>
                Dar +{confirm.days} días a {confirm.row.name}: su prueba terminará el {formatDate(addFreeDays(due(confirm.row), confirm.days, now))}.
              </DialogDescription>
            </DialogHeader>
            <SheetActions>
              <Button
                disabled={pending}
                onClick={() => run(() => grantFreeDays({ companyId: confirm.row.id, days: confirm.days, note: confirm.note || undefined }), `Se dieron ${confirm.days} días a ${confirm.row.name}`, () => setConfirm(null))}
              >
                Confirmar
              </Button>
              <Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
            </SheetActions>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function TrialRow({ row, left, busy, onAsk }: { row: TrialCompanyRow; left: number | null; busy: boolean; onAsk: (days: number, note: string) => void }) {
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const n = Number(custom);
  const validCustom = Number.isInteger(n) && n >= 1 && n <= MAX_FREE_DAYS;
  const tone = left == null || left === 0 ? "bad" : left <= 5 ? "warn" : "ok";
  const label = left == null ? "Sin fecha" : left === 0 ? "Vencida" : `${left} ${left === 1 ? "día" : "días"} restantes`;
  return (
    <div className="flex flex-col gap-2.5 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <b className="block">{row.name} <span className="font-mono text-xs font-normal text-muted-foreground">{row.loginCode}</span></b>
          <small className="block text-xs text-muted-foreground">
            {row.ownerName ?? "Sin dueño"}{row.ownerEmail ? ` · ${row.ownerEmail}` : ""} · Registrada el {formatDate(row.createdAt)}
          </small>
          <small className="block text-xs text-muted-foreground">{row.trialEndsAt ? `Termina el ${formatDate(row.trialEndsAt)}` : "Sin fecha de fin"}</small>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatusPill tone={tone}>{label}</StatusPill>
          {row.freeDaysGranted > 0 && <Pill tone="val">+{row.freeDaysGranted} días regalados</Pill>}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {FREE_DAYS_PRESETS.map((p) => (
          <Button key={p.days} variant="outline" disabled={busy} onClick={() => onAsk(p.days, note.trim())}>{p.label}</Button>
        ))}
        <Field label="Otros días">
          <input type="number" min={1} max={MAX_FREE_DAYS} step={1} value={custom} onChange={(e) => setCustom(e.target.value)} className={`${FIELD_CONTROL} w-28`} />
        </Field>
        <Button disabled={busy || !validCustom} onClick={() => onAsk(n, note.trim())}>Dar días</Button>
        <Field label="Nota (opcional)">
          <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={FIELD_CONTROL} />
        </Field>
      </div>
    </div>
  );
}

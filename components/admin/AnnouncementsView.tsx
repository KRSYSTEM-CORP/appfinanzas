"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill } from "@/components/shared/Pills";
import { Switch } from "@/components/settings/SettingsUi";
import { EmptyCard, SelectControl, formatDate, useAction } from "@/components/admin/platform-ui";
import { SEGMENTS, announcementVisible } from "@/lib/platform-logic";
import { createAnnouncement, deleteAnnouncement, setAnnouncementActive, type AnnouncementRow } from "@/lib/actions/platform";

const TONES = [
  { value: "info", label: "Informativo (azul)" },
  { value: "ok", label: "Bueno (verde)" },
  { value: "warn", label: "Atención (amarillo)" },
  { value: "bad", label: "Urgente (rojo)" },
];

export function AnnouncementsView({ items, nowIso }: { items: AnnouncementRow[]; nowIso: string }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AnnouncementRow | null>(null);
  const now = new Date(nowIso);

  return (
    <div className="flex flex-col gap-3.5">
      <SectionCard
        title="Anuncios dentro de la app"
        subtitle="Aparecen como aviso arriba de cada pantalla para las empresas que elijas, mientras estén activos y vigentes"
        action={<Button onClick={() => setCreating(true)}><PlusIcon className="size-4" aria-hidden /> Crear aviso</Button>}
      >
        {items.length === 0 ? (
          <EmptyCard>No hay avisos. Crea uno para informar a todas las empresas o a un grupo.</EmptyCard>
        ) : (
          items.map((a) => {
            const live = announcementVisible(a, now);
            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <b className="block">{a.title}</b>
                  <p className="text-[13px] text-muted-foreground">{a.body}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone={live ? "ok" : "neutral"}>{live ? "Visible ahora" : "No visible"}</Pill>
                    <Pill>{SEGMENTS.find((s) => s.id === a.segment)?.label ?? "Todas las empresas"}</Pill>
                    {(a.startsAt || a.endsAt) && <Pill>{a.startsAt ? formatDate(a.startsAt) : "—"} a {a.endsAt ? formatDate(a.endsAt) : "—"}</Pill>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label={`Eliminar ${a.title}`} onClick={() => setRemoving(a)}><Trash2Icon className="size-4" aria-hidden /></Button>
                  <Switch on={a.active} disabled={pending} onChange={(v) => run(() => setAnnouncementActive(a.id, v), v ? "Aviso activado" : "Aviso desactivado")} label={`${a.title}: activo`} />
                </div>
              </div>
            );
          })
        )}
      </SectionCard>
      {creating && <CreateSheet onClose={() => setCreating(false)} />}
      {removing && (
        <Dialog open onOpenChange={(o) => !o && setRemoving(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Eliminar el aviso «{removing.title}»?</DialogTitle>
              <DialogDescription>Dejará de mostrarse a las empresas. No se puede deshacer.</DialogDescription>
            </DialogHeader>
            <SheetActions>
              <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteAnnouncement(removing.id), "Aviso eliminado", () => setRemoving(null))}>Sí, eliminar</Button>
              <Button variant="outline" onClick={() => setRemoving(null)}>Cancelar</Button>
            </SheetActions>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateSheet({ onClose }: { onClose: () => void }) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState("info");
  const [segment, setSegment] = useState("todas");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear aviso</DialogTitle>
          <DialogDescription>Se muestra como banner dentro del sistema de cada empresa.</DialogDescription>
        </DialogHeader>
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={FIELD_CONTROL} /></Field>
        <Field label="Texto"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={500} className={`${FIELD_CONTROL} py-2`} /></Field>
        <FieldPair>
          <Field label="Color"><SelectControl label="Color del aviso" value={tone} onChange={setTone} options={TONES} /></Field>
          <Field label="Para"><SelectControl label="Público" value={segment} onChange={setSegment} options={SEGMENTS.map((s) => ({ value: s.id, label: s.label }))} /></Field>
        </FieldPair>
        <FieldPair>
          <Field label="Desde (opcional)"><input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={FIELD_CONTROL} /></Field>
          <Field label="Hasta (opcional)"><input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={FIELD_CONTROL} /></Field>
        </FieldPair>
        <SheetActions>
          <Button disabled={pending || !title.trim() || !body.trim()} onClick={() => run(() => createAnnouncement({ title, body, tone, segment, startsAt: startsAt || null, endsAt: endsAt || null }), "Aviso creado", onClose)}>Crear aviso</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

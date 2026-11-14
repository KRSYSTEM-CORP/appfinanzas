"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill } from "@/components/shared/Pills";
import { MailComposer } from "@/components/admin/MailComposer";
import { EmptyCard, StateBadge, dayLabel, formatDate, formatUSD, useAction } from "@/components/admin/platform-ui";
import { PLANS } from "@/lib/plans";
import { SEGMENTS, companyState, daysUntilDue, inSegment, whatsappUrl, type Segment } from "@/lib/platform-logic";
import { updateCompanyCrm } from "@/lib/actions/admin";
import type { CouponRow, DirectoryRow } from "@/lib/actions/platform";

// CRM de empresas: las empresas son los clientes de KR POS. Grupos, ficha con notas internas,
// etiquetas y próximo contacto, y envío de correos/cupones individual, por grupo o a elegidas.
export function CrmView({ rows, coupons, nowIso }: { rows: DirectoryRow[]; coupons: CouponRow[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [segment, setSegment] = useState<Segment>("todas");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [ficha, setFicha] = useState<DirectoryRow | null>(null);
  const [composer, setComposer] = useState<{ ids: string[] } | null>(null);

  const counts = useMemo(() => Object.fromEntries(SEGMENTS.map((s) => [s.id, rows.filter((r) => inSegment(r, s.id, now)).length])), [rows, now]);
  const allTags = useMemo(() => [...new Set(rows.flatMap((r) => r.crmTags))].sort(), [rows]);
  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (!inSegment(r, segment, now)) return false;
        if (tag && !r.crmTags.includes(tag)) return false;
        const needle = q.trim().toLowerCase();
        return !needle || `${r.name} ${r.ownerEmail}`.toLowerCase().includes(needle);
      }),
    [rows, segment, tag, q, now]
  );

  return (
    <div className="flex flex-col gap-3.5">
      <SectionCard title="Grupos de empresas" subtitle="Elige un grupo para verlo y escribirle">
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              type="button"
              data-kr="chip"
              aria-pressed={segment === s.id}
              onClick={() => setSegment(s.id)}
              className={`inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-[12px] border-2 px-3.5 text-[13px] font-bold ${segment === s.id ? "border-primary bg-accent text-primary" : "border-transparent bg-muted"}`}
            >
              {s.label} <span className="tabular-nums opacity-70">{counts[s.id]}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-2.5">
          <input type="search" aria-label="Buscar empresa" placeholder="Buscar empresa o correo" value={q} onChange={(e) => setQ(e.target.value)} className={FIELD_CONTROL} />
          <select aria-label="Etiqueta" value={tag} onChange={(e) => setTag(e.target.value)} className={FIELD_CONTROL}>
            <option value="">Todas las etiquetas</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Button variant="outline" onClick={() => setComposer({ ids: [] })}>Escribir a este grupo</Button>
        </div>
      </SectionCard>

      <SectionCard title={`Empresas (${shown.length})`}>
        {shown.length === 0 ? (
          <EmptyCard>No hay empresas en este grupo.</EmptyCard>
        ) : (
          shown.map((c) => {
            const next = c.crmNextContactAt;
            const due = next ? daysUntilDue(next, now) : null;
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{c.name}</b>
                  <small className="block truncate text-xs text-muted-foreground">
                    {c.ownerEmail} · {c.userCount} usuario(s) · {c.lastPayment ? `Último pago ${formatUSD(c.lastPayment.amountUsdCents)}` : "Sin pagos"}
                    {c.lastActivityAt ? ` · Última venta ${formatDate(c.lastActivityAt)}` : " · Sin ventas"}
                  </small>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StateBadge state={companyState(c, now)} />
                    <Pill tone="val">{PLANS[c.plan as keyof typeof PLANS]?.label ?? c.plan}</Pill>
                    {next && <Pill tone={due != null && due <= 0 ? "warn" : "neutral"}>Contactar: {formatDate(next)}</Pill>}
                    {c.crmTags.map((t) => <Pill key={t}>{t}</Pill>)}
                  </div>
                </div>
                <Button variant="outline" onClick={() => setFicha(c)}>Ficha</Button>
              </div>
            );
          })
        )}
      </SectionCard>

      {ficha && <FichaSheet key={ficha.id} c={ficha} now={now} onClose={() => setFicha(null)} onMail={() => { setComposer({ ids: [ficha.id] }); setFicha(null); }} />}
      {composer && (
        <Dialog open onOpenChange={(o) => !o && setComposer(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Correo o cupón para {composer.ids.length ? "esta empresa" : "este grupo"}</DialogTitle>
              <DialogDescription>Elige un cupón para enviarlo, o deja «Sin cupón» para un correo normal.</DialogDescription>
            </DialogHeader>
            <MailComposer rows={rows} coupons={coupons} nowIso={nowIso} initialSegment={segment} initialIds={composer.ids} title="Redactar" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function FichaSheet({ c, now, onClose, onMail }: { c: DirectoryRow; now: Date; onClose: () => void; onMail: () => void }) {
  const { pending, run } = useAction();
  const [note, setNote] = useState(c.crmNote ?? "");
  const [tags, setTags] = useState(c.crmTags.join(", "));
  const [next, setNext] = useState(c.crmNextContactAt ? c.crmNextContactAt.toISOString().slice(0, 10) : "");
  const wa = whatsappUrl(c.phone);
  const days = daysUntilDue(c.nextPaymentDueDate, now);
  const info: [string, string][] = [
    ["Plan", PLANS[c.plan as keyof typeof PLANS]?.label ?? c.plan],
    ["Vencimiento", c.isExempt ? "Exenta de pago" : c.nextPaymentDueDate ? `${formatDate(c.nextPaymentDueDate)} · ${dayLabel(days)}` : "Sin fecha"],
    ["Último pago", c.lastPayment ? `${formatUSD(c.lastPayment.amountUsdCents)} · ${formatDate(c.lastPayment.createdAt)}` : "Sin pagos"],
    ["Usuarios", `${c.usersActive} activos de ${c.userCount}`],
    ["Productos", String(c.productCount)],
    ["Contacto", `${c.ownerName} · ${c.ownerEmail}${c.phone ? ` · ${c.phone}` : ""}`],
    ["Registrada", formatDate(c.createdAt)],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c.name}</DialogTitle>
          <DialogDescription><StateBadge state={companyState(c, now)} /></DialogDescription>
        </DialogHeader>
        <dl className="mt-3 text-[13px]">
          {info.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b py-1.5 last:border-0">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <Field label="Notas internas (solo las ves tú)">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${FIELD_CONTROL} py-2`} />
        </Field>
        <FieldPair>
          <Field label="Etiquetas (separadas por coma)"><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, tienda, interesado" className={FIELD_CONTROL} /></Field>
          <Field label="Próximo contacto"><input type="date" value={next} onChange={(e) => setNext(e.target.value)} className={FIELD_CONTROL} /></Field>
        </FieldPair>
        <SheetActions>
          <Button disabled={pending} onClick={() => run(() => updateCompanyCrm(c.id, { note, tags: tags.split(","), nextContactAt: next || null }), "Ficha guardada", onClose)}>Guardar ficha</Button>
          <Button variant="outline" onClick={onMail}>Enviar correo o cupón</Button>
          {wa && <Button variant="outline" render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>WhatsApp</Button>}
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

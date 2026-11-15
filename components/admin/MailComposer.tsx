"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { Pill } from "@/components/shared/Pills";
import { SelectControl, useAction } from "@/components/admin/platform-ui";
import {
  EMAIL_TEMPLATES,
  SEGMENTS,
  fillTemplate,
  selectRecipients,
  type Audience,
  type Segment,
} from "@/lib/platform-logic";
import { couponLabel } from "@/lib/coupons";
import { sendBulkEmail, sendCouponEmail, type CouponRow, type DirectoryRow } from "@/lib/actions/platform";

// Redacta y envía un correo a las empresas: público (segmento o empresas elegidas) con conteo
// previo, plantillas, vista previa y, si se elige un cupón, el código y el descuento en el texto.
export function MailComposer({
  rows,
  coupons,
  nowIso,
  initialSegment = "todas",
  initialIds = [],
  initialCouponId = "",
  title = "Redactar correo",
}: {
  rows: DirectoryRow[];
  coupons: CouponRow[];
  nowIso: string;
  initialSegment?: Segment;
  initialIds?: string[];
  initialCouponId?: string;
  title?: string;
}) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const { pending, run } = useAction();
  const [mode, setMode] = useState<"segment" | "selected">(initialIds.length ? "selected" : "segment");
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [ids, setIds] = useState<string[]>(initialIds);
  const [couponId, setCouponId] = useState(initialCouponId);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [pick, setPick] = useState("");
  const [preview, setPreview] = useState(false);

  const audience: Audience = mode === "segment" ? { kind: "segment", segment } : { kind: "selected", ids };
  const coupon = coupons.find((c) => c.id === couponId) ?? null;
  const recipients = useMemo(() => {
    let r = selectRecipients(rows, audience, now);
    if (coupon?.companyId) r = r.filter((x) => x.id === coupon.companyId);
    if (coupon?.plan) r = r.filter((x) => x.plan === coupon.plan);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode, segment, ids, coupon, now]);

  const extra: Record<string, string> = coupon ? { codigo: coupon.code, cupon: couponLabel(coupon) } : {};
  const sample = recipients[0] ?? rows[0];
  const ready = subject.trim() && message.trim() && recipients.length > 0;

  function applyTemplate(id: string) {
    const t = EMAIL_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setMessage(t.message);
    if (id === "cupon" && !couponId && coupons.length) setCouponId(coupons.find((c) => c.active)?.id ?? "");
  }

  function send() {
    run(
      async () => {
        const res = coupon
          ? await sendCouponEmail({ couponId: coupon.id, subject, message, audience })
          : await sendBulkEmail({ subject, message, audience });
        if (!res.success) return res;
        toast.success(`Enviado a ${res.sent} de ${res.total} empresas.`);
        setSubject("");
        setMessage("");
        return { success: true } as const;
      },
      "Envío terminado"
    );
  }

  return (
    <SectionCard title={title} subtitle="El texto admite {{empresa}}, {{plan}}, {{vencimiento}} y {{dias}}; con un cupón también {{codigo}} y {{cupon}}.">
      <div className="mb-1 flex flex-wrap gap-2">
        {EMAIL_TEMPLATES.map((t) => (
          <button key={t.id} type="button" data-kr="chip" onClick={() => applyTemplate(t.id)} className="inline-flex min-h-[38px] items-center rounded-[12px] border-2 border-transparent bg-muted px-3.5 text-[13px] font-bold hover:border-primary">
            {t.label}
          </button>
        ))}
      </div>

      <Field label="Destinatarios">
        <SelectControl
          label="Tipo de público"
          value={mode}
          onChange={(v) => setMode(v as "segment" | "selected")}
          options={[{ value: "segment", label: "Un grupo de empresas" }, { value: "selected", label: "Empresas elegidas" }]}
        />
      </Field>
      {mode === "segment" ? (
        <Field label="Grupo">
          <SelectControl label="Grupo" value={segment} onChange={(v) => setSegment(v as Segment)} options={SEGMENTS.map((s) => ({ value: s.id, label: s.label }))} />
        </Field>
      ) : (
        <Field label="Elegir empresas">
          <SelectControl
            label="Agregar empresa"
            value={pick}
            onChange={(v) => {
              if (v && !ids.includes(v)) setIds([...ids, v]);
              setPick("");
            }}
            options={[{ value: "", label: "Agregar una empresa…" }, ...rows.filter((r) => !ids.includes(r.id)).map((r) => ({ value: r.id, label: `${r.name} · ${r.ownerEmail}` }))]}
          />
          <span className="flex flex-wrap gap-1.5 pt-1">
            {ids.map((id) => (
              <button key={id} type="button" onClick={() => setIds(ids.filter((x) => x !== id))} aria-label={`Quitar ${rows.find((r) => r.id === id)?.name ?? id}`}>
                <Pill tone="val">{rows.find((r) => r.id === id)?.name ?? id} ✕</Pill>
              </button>
            ))}
          </span>
        </Field>
      )}

      <Field label="Cupón (opcional)">
        <SelectControl
          label="Cupón"
          value={couponId}
          onChange={setCouponId}
          options={[{ value: "", label: "Sin cupón" }, ...coupons.filter((c) => c.active).map((c) => ({ value: c.id, label: `${c.code} · ${couponLabel(c)}` }))]}
        />
      </Field>

      <Field label="Asunto">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej. Novedades en KR POS" className={FIELD_CONTROL} />
      </Field>
      <Field label="Mensaje">
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={7} className={`${FIELD_CONTROL} py-2`} placeholder="Escribe el correo…" />
      </Field>

      <p className="mt-3 text-[13px] text-muted-foreground" aria-live="polite">
        Se enviará a <b className="text-foreground">{recipients.length}</b> empresa(s) con correo real y cuenta activa.
      </p>

      {preview && sample && (
        <div className="mt-3 rounded-[14px] bg-muted p-3.5 text-[13px]">
          <b className="block">{fillTemplate(subject || "(sin asunto)", sample, now, extra)}</b>
          <p className="mt-2 whitespace-pre-wrap">{fillTemplate(message || "(sin mensaje)", sample, now, extra)}</p>
          <small className="mt-2 block text-xs text-muted-foreground">Vista previa con los datos de {sample.name}.</small>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={pending || !ready} onClick={send}>
          {pending ? "Enviando…" : coupon ? "Enviar cupón" : "Enviar correo"}
        </Button>
        <Button variant="outline" onClick={() => setPreview((v) => !v)} disabled={!subject.trim() && !message.trim()}>
          {preview ? "Ocultar vista previa" : "Vista previa"}
        </Button>
      </div>
    </SectionCard>
  );
}

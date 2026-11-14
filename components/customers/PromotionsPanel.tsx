"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill } from "@/components/shared/Pills";
import { SectionCard, TwoCol } from "@/components/shared/SectionCard";
import { createPromotion, registerRedemption, type PromotionRow } from "@/lib/actions/marketing";
import { normalizePromoCode, promoCode, promotionMessage, PROMO_LISTS, shortDate, whatsappLink, type PromoListId } from "@/lib/marketing";

export type PromoCustomer = { id: string; firstName: string; lastName: string; phone: string; segment: string; birthdayThisMonth: boolean };

function listOf(customers: PromoCustomer[], id: string): PromoCustomer[] {
  if (id === "todos") return customers;
  if (id === "cumpleaneros") return customers.filter((c) => c.birthdayThisMonth);
  return customers.filter((c) => c.segment === id);
}

// Marketing → Promociones (preview, vPromo): «Crear promoción», «Vista previa de WhatsApp» y
// «Promociones» con códigos activos y canjes. El envío abre WhatsApp (wa.me) con cada cliente de la lista.
export function PromotionsPanel({ promotions, customers, businessName }: { promotions: PromotionRow[]; customers: PromoCustomer[]; businessName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const [list, setList] = useState<PromoListId>("dormidos");
  const [pct, setPct] = useState("15");
  const [days, setDays] = useState<7 | 15 | 30>(15);
  const [code, setCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const percent = Math.max(0, Math.min(60, Math.round(Number(pct) || 0)));
  const finalCode = dirty ? code : promoCode(list, percent);
  const recipients = useMemo(() => listOf(customers, list), [customers, list]);
  const validUntil = new Date(now + days * 86_400_000);
  const preview = promotionMessage({ code: finalCode || "CÓDIGO", discountPercent: percent, validUntil, firstName: recipients[0]?.firstName }, businessName);
  const exists = promotions.some((p) => p.code === finalCode && new Date(p.validUntil).getTime() >= now);

  function create(after?: () => void) {
    start(async () => {
      const r = await createPromotion({ segment: list, discountPercent: percent, days, code: finalCode });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(`Promoción ${finalCode} creada`);
      setDirty(false);
      router.refresh();
      after?.();
    });
  }

  return (
    <>
      <TwoCol>
        <SectionCard title="Crear promoción" subtitle="Elige a quién, cuánto y por cuánto tiempo">
          <Field label="Lista de clientes">
            <select className={FIELD_CONTROL} value={list} onChange={(e) => setList(e.target.value as PromoListId)}>
              {PROMO_LISTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} ({listOf(customers, l.id).length})
                </option>
              ))}
            </select>
          </Field>
          <FieldPair>
            <Field label="Descuento (%)">
              <input className={FIELD_CONTROL} type="number" min={1} max={60} value={pct} onChange={(e) => setPct(e.target.value)} />
            </Field>
            <Field label="Vigencia">
              <select className={FIELD_CONTROL} value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 15 | 30)}>
                {[7, 15, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} días
                  </option>
                ))}
              </select>
            </Field>
          </FieldPair>
          <Field label="Código generado">
            <input
              className={`${FIELD_CONTROL} font-extrabold uppercase tracking-[0.06em]`}
              maxLength={14}
              value={finalCode}
              onChange={(e) => {
                setDirty(true);
                setCode(normalizePromoCode(e.target.value));
              }}
            />
          </Field>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <Button disabled={pending || percent < 1 || finalCode.length < 3} onClick={() => create()}>
              <PlusIcon aria-hidden /> Crear promoción
            </Button>
          </div>
        </SectionCard>
        <SectionCard title="Vista previa de WhatsApp" subtitle={`Así lo recibirá cada cliente de la lista (${recipients.length})`}>
          <div className="rounded-[16px] bg-muted p-3.5">
            <div className="ml-auto max-w-[340px] whitespace-pre-wrap rounded-[16px_16px_4px_16px] bg-wa-bubble px-3.5 py-2.5 text-sm text-wa-ink shadow-xs">{preview}</div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={recipients.length === 0} onClick={() => setSending(true)}>
              Enviar por WhatsApp
            </Button>
          </div>
        </SectionCard>
      </TwoCol>

      <SectionCard title="Promociones" subtitle="Códigos activos y canjes">
        {promotions.length === 0 && <p className="text-[13px] text-muted-foreground">Aún no hay promociones. Crea la primera arriba.</p>}
        {promotions.map((p) => {
          const expired = new Date(p.validUntil).getTime() < now;
          const size = listOf(customers, p.segment).length;
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
              <div className="min-w-0">
                <b className="font-mono tracking-[0.05em]">{p.code}</b> <Pill tone="val">{p.discountPercent} %</Pill> {expired && <Pill tone="bad">Vencida</Pill>}
                <small className="block text-xs text-muted-foreground">
                  {PROMO_LISTS.find((l) => l.id === p.segment)?.label ?? p.name} · vence el {shortDate(p.validUntil)}
                </small>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right font-bold tabular-nums">
                  {p.redemptions} canjes
                  <small className="block text-xs text-muted-foreground">de {size} en la lista</small>
                </div>
                <Button
                  variant="outline"
                  disabled={pending || expired}
                  onClick={() =>
                    start(async () => {
                      const r = await registerRedemption(p.id);
                      if (!r.success) toast.error(r.error);
                      else toast.success(`Canje registrado con ${p.code}`);
                      router.refresh();
                    })
                  }
                >
                  Registrar canje
                </Button>
              </div>
            </div>
          );
        })}
      </SectionCard>

      <Dialog open={sending} onOpenChange={setSending}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar por WhatsApp</DialogTitle>
            <DialogDescription>
              {recipients.length} clientes · código {finalCode}. Toca cada cliente para abrir WhatsApp con su mensaje listo.
            </DialogDescription>
          </DialogHeader>
          {!exists && (
            <div className="mt-3 rounded-[14px] bg-warn-solid/18 p-3 text-[13px] text-warning">
              El código {finalCode} aún no está creado: créalo para poder registrar los canjes.
              <div className="mt-2">
                <Button size="sm" disabled={pending || finalCode.length < 3} onClick={() => create()}>
                  Crear promoción
                </Button>
              </div>
            </div>
          )}
          <div className="mt-2 max-h-[45vh] overflow-y-auto">
            {recipients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
                <div className="min-w-0">
                  <b>
                    {c.firstName} {c.lastName}
                  </b>
                  <small className="block text-xs text-muted-foreground">{c.phone}</small>
                </div>
                <a
                  href={whatsappLink(c.phone, promotionMessage({ code: finalCode, discountPercent: percent, validUntil, firstName: c.firstName }, businessName))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-2 py-1.5 text-[13px] font-semibold text-primary hover:bg-muted"
                >
                  WhatsApp
                </a>
              </div>
            ))}
          </div>
          <SheetActions>
            <Button variant="outline" onClick={() => setSending(false)}>
              Cerrar
            </Button>
          </SheetActions>
        </DialogContent>
      </Dialog>
    </>
  );
}

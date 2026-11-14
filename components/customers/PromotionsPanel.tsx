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
import { customerInPromo, normalizePromoCode, promoCode, promoSegmentLabel, promotionMessage, PROMO_LISTS, shortDate, whatsappLink, type PromoListId, type PromoTarget, type SegmentId } from "@/lib/marketing";

export type PromoCustomer = { id: string; firstName: string; lastName: string; phone: string; segment: string; birthDate: string | null };

type ListChoice = PromoListId | "clientes";
// Orden: todos, los cuatro grupos, cumpleañeros del periodo y clientes elegidos a mano.
const CHOICES: { id: ListChoice; label: string }[] = [
  { id: "todos", label: "Todos los clientes" },
  ...PROMO_LISTS.filter((l) => l.id !== "todos" && l.id !== "cumpleaneros"),
  { id: "cumpleaneros", label: "Cumpleañeros del periodo" },
  { id: "clientes", label: "Clientes elegidos" },
];

function listOf(customers: PromoCustomer[], target: PromoTarget): PromoCustomer[] {
  return customers.filter((c) => customerInPromo(target, { id: c.id, segment: c.segment as SegmentId, birthDate: c.birthDate }));
}

function targetLabel(p: { segment: string; rangeFrom?: string | null; rangeTo?: string | null; customerIds?: string[] }): string {
  if (p.segment === "cumpleaneros" && p.rangeFrom && p.rangeTo) return `Cumpleañeros del ${shortDate(`${p.rangeFrom}T12:00:00Z`)} al ${shortDate(`${p.rangeTo}T12:00:00Z`)}`;
  if (p.segment === "clientes") return `Clientes elegidos (${p.customerIds?.length ?? 0})`;
  return promoSegmentLabel(p.segment);
}

// Marketing → Promociones (preview, vPromo): «Crear promoción», «Vista previa de WhatsApp» y
// «Promociones» con códigos activos y canjes. El envío abre WhatsApp (wa.me) con cada cliente de la lista.
export function PromotionsPanel({ promotions, customers, businessName }: { promotions: PromotionRow[]; customers: PromoCustomer[]; businessName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const [list, setList] = useState<ListChoice>("dormidos");
  const [monthStart] = useState(() => new Date(now).toISOString().slice(0, 8) + "01");
  const [rangeFrom, setRangeFrom] = useState(monthStart);
  const [rangeTo, setRangeTo] = useState(() => new Date(now).toISOString().slice(0, 10));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pickQ, setPickQ] = useState("");
  const [pct, setPct] = useState("15");
  const [days, setDays] = useState<7 | 15 | 30>(15);
  const [code, setCode] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sending, setSending] = useState(false);
  const percent = Math.max(0, Math.min(60, Math.round(Number(pct) || 0)));
  const finalCode = dirty ? code : promoCode(list === "clientes" ? "todos" : list, percent);
  const target: PromoTarget = useMemo(() => ({ segment: list, rangeFrom, rangeTo, customerIds: [...picked] }), [list, rangeFrom, rangeTo, picked]);
  const recipients = useMemo(() => listOf(customers, target), [customers, target]);
  const pickNeedle = pickQ.trim().toLowerCase();
  const pickable = customers.filter((c) => !pickNeedle || `${c.firstName} ${c.lastName}`.toLowerCase().includes(pickNeedle) || c.phone.includes(pickNeedle));
  const canCreate = list === "cumpleaneros" ? rangeFrom !== "" && rangeTo !== "" && rangeTo >= rangeFrom : list === "clientes" ? picked.size > 0 : true;
  const validUntil = new Date(now + days * 86_400_000);
  const preview = promotionMessage({ code: finalCode || "CÓDIGO", discountPercent: percent, validUntil, firstName: recipients[0]?.firstName }, businessName);
  const exists = promotions.some((p) => p.code === finalCode && new Date(p.validUntil).getTime() >= now);

  function create(after?: () => void) {
    start(async () => {
      const r = await createPromotion({ segment: list, discountPercent: percent, days, code: finalCode, rangeFrom: list === "cumpleaneros" ? rangeFrom : undefined, rangeTo: list === "cumpleaneros" ? rangeTo : undefined, customerIds: list === "clientes" ? [...picked] : undefined });
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
          <Field label="¿A quién va?">
            <select className={FIELD_CONTROL} value={list} onChange={(e) => setList(e.target.value as ListChoice)}>
              {CHOICES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                  {l.id !== "cumpleaneros" && l.id !== "clientes" ? ` (${listOf(customers, { segment: l.id }).length})` : ""}
                </option>
              ))}
            </select>
          </Field>
          {list === "cumpleaneros" && (
            <>
              <FieldPair>
                <Field label="Cumplen desde">
                  <input className={FIELD_CONTROL} type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
                </Field>
                <Field label="Hasta">
                  <input className={FIELD_CONTROL} type="date" value={rangeTo} min={rangeFrom} onChange={(e) => setRangeTo(e.target.value)} />
                </Field>
              </FieldPair>
              <p className="text-xs text-muted-foreground">Cuenta el día y el mes de nacimiento dentro del periodo; el año no importa. {recipients.length} clientes.</p>
            </>
          )}
          {list === "clientes" && (
            <Field label={`Clientes (${picked.size} elegidos)`}>
              <input className={FIELD_CONTROL} type="search" placeholder="Buscar cliente…" value={pickQ} onChange={(e) => setPickQ(e.target.value)} />
              <div className="mt-2 max-h-48 overflow-y-auto rounded-[12px] border p-1.5">
                {pickable.length === 0 && <p className="p-2 text-[13px] text-muted-foreground">Ningún cliente coincide.</p>}
                {pickable.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() =>
                        setPicked((prev) => {
                          const n = new Set(prev);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                    />
                    <span>
                      {c.firstName} {c.lastName} <small className="text-muted-foreground">{c.phone}</small>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          )}
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
            <Button disabled={pending || !canCreate || percent < 1 || finalCode.length < 3} onClick={() => create()}>
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
          const size = listOf(customers, { segment: p.segment, rangeFrom: p.rangeFrom, rangeTo: p.rangeTo, customerIds: p.customerIds }).length;
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
              <div className="min-w-0">
                <b className="font-mono tracking-[0.05em]">{p.code}</b> <Pill tone="val">{p.discountPercent} %</Pill> {expired && <Pill tone="bad">Vencida</Pill>}
                <small className="block text-xs text-muted-foreground">
                  {targetLabel(p)} · vence el {shortDate(p.validUntil)}
                  {p.redeemers.length > 0 && <> · Canjeó: {p.redeemers.join(", ")}{p.redemptions > p.redeemers.length ? "…" : ""}</>}
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

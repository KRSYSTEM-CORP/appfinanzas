"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill, StatusPill } from "@/components/shared/Pills";
import { Switch } from "@/components/settings/SettingsUi";
import { MailComposer } from "@/components/admin/MailComposer";
import { EmptyCard, SelectControl, formatDate, formatUSD, useAction } from "@/components/admin/platform-ui";
import { PLANS } from "@/lib/plans";
import { couponLabel } from "@/lib/coupons";
import { createCoupon, setCouponActive, type CouponRedemptionRow, type CouponRow, type DirectoryRow } from "@/lib/actions/platform";

export function CouponsView({ coupons, redemptions, rows, nowIso }: { coupons: CouponRow[]; redemptions: CouponRedemptionRow[]; rows: DirectoryRow[]; nowIso: string }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<CouponRow | null>(null);
  const exportHref = "/admin/export?kind=canjes";

  return (
    <div className="flex flex-col gap-3.5">
      <SectionCard
        title="Cupones de suscripción"
        subtitle="Descuentos para las empresas al pagar su plan. Cada empresa lo usa una sola vez; el precio base es el del plan"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" render={<a href={exportHref} />}>Exportar canjes</Button>
            <Button onClick={() => setCreating(true)}><PlusIcon className="size-4" aria-hidden /> Crear cupón</Button>
          </div>
        }
      >
        {coupons.length === 0 ? (
          <EmptyCard>Aún no hay cupones. Crea el primero y envíalo por correo a las empresas.</EmptyCard>
        ) : (
          coupons.map((c) => {
            const expired = c.expiresAt != null && c.expiresAt.getTime() < new Date(nowIso).getTime();
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-3 last:border-0">
                <div className="min-w-0">
                  <b className="block font-mono tracking-wide">{c.code}</b>
                  <small className="block text-xs text-muted-foreground">
                    {couponLabel(c)} · Usos {c.usedCount}/{c.maxUses ?? "∞"}
                    {c.expiresAt ? ` · Vigente hasta ${formatDate(c.expiresAt)}` : " · Sin vencimiento"}
                  </small>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.plan && <Pill tone="val">Plan {PLANS[c.plan as keyof typeof PLANS]?.label ?? c.plan}</Pill>}
                    {c.companyName ? <Pill tone="warn">Solo {c.companyName}</Pill> : <Pill>Todas las empresas</Pill>}
                    {expired && <StatusPill tone="bad">Vencido</StatusPill>}
                    {c.maxUses != null && c.usedCount >= c.maxUses && <StatusPill tone="warn">Agotado</StatusPill>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" disabled={!c.active} onClick={() => setSending(c)}>Enviar por correo</Button>
                  <Switch on={c.active} disabled={pending} onChange={(v) => run(() => setCouponActive(c.id, v), v ? "Cupón activado" : "Cupón desactivado")} label={`Cupón ${c.code}: activo`} />
                </div>
              </div>
            );
          })
        )}
      </SectionCard>

      <SectionCard title="Canjes" subtitle="Cupones que las empresas aplicaron al reportar su pago. «Confirmado» = el pago ya fue aprobado">
        {redemptions.length === 0 ? (
          <EmptyCard>Todavía nadie canjeó un cupón.</EmptyCard>
        ) : (
          redemptions.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2.5 border-b py-2.5 text-sm last:border-0">
              <div className="min-w-0">
                <b className="block truncate">{r.companyName}</b>
                <small className="text-xs text-muted-foreground">{r.code} · {formatDate(r.createdAt)}</small>
              </div>
              <div className="flex items-center gap-2">
                <b className="tabular-nums">−{formatUSD(r.discountUsdCents)}</b>
                <StatusPill tone={r.confirmed ? "ok" : "warn"}>{r.confirmed ? "Confirmado" : "Reservado"}</StatusPill>
              </div>
            </div>
          ))
        )}
      </SectionCard>

      {creating && <CreateSheet rows={rows} onClose={() => setCreating(false)} />}
      {sending && (
        <Dialog open onOpenChange={(o) => !o && setSending(null)}>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Enviar el cupón {sending.code}</DialogTitle>
              <DialogDescription>Elige el público, ajusta el texto y revisa la vista previa.</DialogDescription>
            </DialogHeader>
            <MailComposer
              rows={rows}
              coupons={coupons}
              nowIso={nowIso}
              initialCouponId={sending.id}
              initialIds={sending.companyId ? [sending.companyId] : []}
              title="Correo con cupón"
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CreateSheet({ rows, onClose }: { rows: DirectoryRow[]; onClose: () => void }) {
  const { pending, run } = useAction();
  const [code, setCode] = useState("");
  const [type, setType] = useState("PERCENT");
  const [value, setValue] = useState("");
  const [plan, setPlan] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxUses, setMaxUses] = useState("1");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crear cupón</DialogTitle>
          <DialogDescription>Cada empresa solo puede canjearlo una vez.</DialogDescription>
        </DialogHeader>
        <Field label="Código">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="NOVIEMBRE10" className={FIELD_CONTROL} />
        </Field>
        <FieldPair>
          <Field label="Tipo">
            <SelectControl label="Tipo de descuento" value={type} onChange={setType} options={[{ value: "PERCENT", label: "Porcentaje (%)" }, { value: "AMOUNT", label: "Monto en USD" }]} />
          </Field>
          <Field label={type === "PERCENT" ? "Porcentaje" : "Monto (USD)"}>
            <input type="number" min={0} step={type === "PERCENT" ? 1 : 0.01} value={value} onChange={(e) => setValue(e.target.value)} className={FIELD_CONTROL} />
          </Field>
        </FieldPair>
        <FieldPair>
          <Field label="Plan (opcional)">
            <SelectControl label="Plan aplicable" value={plan} onChange={setPlan} options={[{ value: "", label: "Cualquier plan" }, ...Object.values(PLANS).map((p) => ({ value: p.id, label: p.label }))]} />
          </Field>
          <Field label="Empresa (opcional)">
            <SelectControl label="Empresa específica" value={companyId} onChange={setCompanyId} options={[{ value: "", label: "Todas las empresas" }, ...rows.map((r) => ({ value: r.id, label: r.name }))]} />
          </Field>
        </FieldPair>
        <FieldPair>
          <Field label="Vigente hasta (opcional)">
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={FIELD_CONTROL} />
          </Field>
          <Field label="Usos máximos en total">
            <input type="number" min={1} step={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={FIELD_CONTROL} />
          </Field>
        </FieldPair>
        <SheetActions>
          <Button
            disabled={pending || !code || !value}
            onClick={() =>
              run(
                () => createCoupon({ code, discountType: type, value, plan: plan || null, companyId: companyId || null, expiresAt: expiresAt || null, maxUses: maxUses || null }),
                "Cupón creado",
                onClose
              )
            }
          >
            Crear cupón
          </Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

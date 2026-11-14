"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { SmartphoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard, ListRow } from "@/components/shared/SectionCard";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { StatusPill } from "@/components/shared/Pills";
import { Switch } from "@/components/settings/SettingsUi";
import { EmptyCard, formatDate, formatUSD, useAction } from "@/components/admin/platform-ui";
import { BANKS } from "@/lib/payment-accounts";
import { resizeImageToDataUrl } from "@/lib/image-utils";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { parsePlanRequest, PLANS } from "@/lib/plans";
import {
  fetchAndUpdatePlatformBcvRate,
  setPlatformPaymentMethodEnabled,
  updatePlatformExchangeRate,
  updatePlatformSettings,
  type PlatformSettingsView,
} from "@/lib/actions/admin";
import type { PaymentMethod } from "@prisma/client";

export type ReportHistoryRow = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  company: { name: string };
  lines: { paymentMethod: PaymentMethod; amountUsdCents: number; reference: string | null }[];
};

const STATUS: Record<ReportHistoryRow["status"], { label: string; tone: "ok" | "warn" | "bad" }> = {
  APPROVED: { label: "Aprobado", tone: "ok" },
  PENDING: { label: "Pendiente", tone: "warn" },
  REJECTED: { label: "Rechazado", tone: "bad" },
};

// Plataforma → Pagos de suscripción: los métodos a los que las empresas pagan su suscripción
// (mismo patrón que Ajustes → Métodos de pago), la tasa dólar BCV y el historial de reportes.
export function PaymentMethodsView({
  settings,
  rate,
  rateUpdatedAt,
  history,
}: {
  settings: PlatformSettingsView;
  rate: number | null;
  rateUpdatedAt: Date | null;
  history: ReportHistoryRow[];
}) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState<"PAGO_MOVIL" | "BINANCE" | null>(null);
  const pmLoaded = Boolean(settings.pagoMovilBank && settings.pagoMovilPhone && settings.pagoMovilId);
  const bnLoaded = Boolean(settings.binanceId || settings.binanceQrDataUrl);

  function toggle(method: "PAGO_MOVIL" | "BINANCE", on: boolean) {
    run(() => setPlatformPaymentMethodEnabled(method, on), on ? "Método visible para las empresas" : "Método oculto para las empresas");
  }

  return (
    <div className="flex flex-col gap-3.5">
      <SectionCard title="Métodos de pago de la suscripción" subtitle="Los que ven las empresas en Ajustes → Mi plan al pagar. Pago Móvil se cobra en bolívares a la tasa BCV; Binance en dólares">
        <ListRow>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-[46px] flex-none items-center justify-center rounded-[14px] bg-accent text-primary">
              <SmartphoneIcon className="size-[22px]" aria-hidden />
            </span>
            <span>
              <b>Pago Móvil</b>
              <small>Moneda: bolívares · {pmLoaded ? "Datos cargados" : "Sin datos cargados"}</small>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditing("PAGO_MOVIL")}>Editar</Button>
            <Switch on={settings.pagoMovilEnabled} disabled={pending} onChange={(v) => toggle("PAGO_MOVIL", v)} label="Pago Móvil: mostrar en el pago de la suscripción" />
          </div>
        </ListRow>
        <ListRow>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-[46px] w-[68px] flex-none items-center justify-center overflow-hidden rounded-[14px] bg-white px-2 py-1.5 shadow-[inset_0_0_0_1px_rgba(20,22,31,.1)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/banks/binance.png" alt="Binance" className="size-full object-contain" />
            </span>
            <span>
              <b>Binance Pay</b>
              <small>Moneda: divisa · {bnLoaded ? "Datos cargados" : "Sin datos cargados"}</small>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setEditing("BINANCE")}>Editar</Button>
            <Switch on={settings.binanceEnabled} disabled={pending} onChange={(v) => toggle("BINANCE", v)} label="Binance Pay: mostrar en el pago de la suscripción" />
          </div>
        </ListRow>
        {!settings.pagoMovilEnabled && !settings.binanceEnabled && (
          <p role="alert" className="mt-3 text-[13px] text-destructive">Con los dos métodos ocultos, las empresas no pueden pagar su suscripción desde la app.</p>
        )}
      </SectionCard>

      <RateCard rate={rate} updatedAt={rateUpdatedAt} />

      <SectionCard title="Historial de pagos reportados" subtitle="Los 50 reportes más recientes de las empresas">
        {history.length === 0 ? (
          <EmptyCard>Todavía no hay pagos reportados.</EmptyCard>
        ) : (
          history.map((r) => {
            const total = r.lines.reduce((s, l) => s + l.amountUsdCents, 0);
            const plan = parsePlanRequest(r.note);
            return (
              <ListRow key={r.id}>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <b className="block">{r.company.name}</b>
                  <small>
                    {formatDate(r.createdAt)} · {r.lines.map((l) => PAYMENT_METHOD_LABELS[l.paymentMethod]).join(", ")}
                    {plan ? ` · ${PLANS[plan].label}` : ""}
                    {r.lines.some((l) => l.reference) ? ` · ref. ${r.lines.map((l) => l.reference).filter(Boolean).join(", ")}` : ""}
                  </small>
                </div>
                <div className="flex flex-none flex-wrap items-center justify-end gap-x-2 gap-y-1">
                  <b className="tabular-nums">{formatUSD(total)}</b>
                  <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusPill>
                </div>
              </ListRow>
            );
          })
        )}
      </SectionCard>

      {editing && <MethodSheet key={editing} method={editing} settings={settings} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RateCard({ rate, updatedAt }: { rate: number | null; updatedAt: Date | null }) {
  const { pending, run } = useAction();
  const [value, setValue] = useState(rate != null ? String(rate) : "");
  return (
    <SectionCard title="Tasa dólar BCV de la plataforma" subtitle="Convierte el precio de los planes (USD) a bolívares para Pago Móvil. Se actualiza sola cada día; el botón es para no esperar">
      <div className="flex flex-wrap items-end gap-2.5">
        <Field label="Bs por 1 USD" className="mt-0 min-w-[160px] flex-1">
          <input type="number" min={0} step="0.0001" value={value} onChange={(e) => setValue(e.target.value)} className={FIELD_CONTROL} />
        </Field>
        <Button
          disabled={pending || !value}
          onClick={() => {
            const fd = new FormData();
            fd.set("rate", value);
            run(() => updatePlatformExchangeRate(fd), "Tasa actualizada");
          }}
        >
          Actualizar tasa
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(() => fetchAndUpdatePlatformBcvRate(), "Tasa actualizada con el BCV")}>
          Actualizar con BCV
        </Button>
      </div>
      {updatedAt && <p className="mt-2 text-[13px] text-muted-foreground">Última actualización: {formatDate(updatedAt)}</p>}
    </SectionCard>
  );
}

function MethodSheet({ method, settings, onClose }: { method: "PAGO_MOVIL" | "BINANCE"; settings: PlatformSettingsView; onClose: () => void }) {
  const { pending, run } = useAction();
  const [bank, setBank] = useState(settings.pagoMovilBank ?? "");
  const [phone, setPhone] = useState(settings.pagoMovilPhone ?? "");
  const [docId, setDocId] = useState(settings.pagoMovilId ?? "");
  const [binanceId, setBinanceId] = useState(settings.binanceId ?? "");
  const [qr, setQr] = useState(settings.binanceQrDataUrl ?? "");
  const [notes, setNotes] = useState(settings.paymentInstructions ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setQr(await resizeImageToDataUrl(file, { maxDimension: 600, format: "image/png" }));
    } catch {
      toast.error("No se pudo procesar la imagen. Intenta con otro archivo.");
    }
  }

  function save() {
    run(
      () =>
        updatePlatformSettings({
          paymentInstructions: notes,
          binanceQrDataUrl: qr,
          binanceId,
          pagoMovilBank: bank,
          pagoMovilPhone: phone,
          pagoMovilId: docId,
        }),
      "Datos guardados",
      onClose
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{method === "PAGO_MOVIL" ? "Pago Móvil" : "Binance Pay"}</DialogTitle>
          <DialogDescription>Datos que verán las empresas al pagar su suscripción</DialogDescription>
        </DialogHeader>
        {method === "PAGO_MOVIL" ? (
          <>
            <Field label="Banco">
              <select value={bank} onChange={(e) => setBank(e.target.value)} className={FIELD_CONTROL}>
                <option value="">Selecciona un banco</option>
                {bank && !BANKS.some((b) => b.label === bank) && <option value={bank}>{bank}</option>}
                {BANKS.map((b) => (
                  <option key={b.key} value={b.label}>{b.label}</option>
                ))}
              </select>
            </Field>
            <FieldPair>
              <Field label="Teléfono"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412-1234567" className={FIELD_CONTROL} /></Field>
              <Field label="Cédula o RIF"><input value={docId} onChange={(e) => setDocId(e.target.value)} placeholder="V-12345678" className={FIELD_CONTROL} /></Field>
            </FieldPair>
          </>
        ) : (
          <>
            <Field label="ID de la cuenta de Binance">
              <input value={binanceId} onChange={(e) => setBinanceId(e.target.value)} placeholder="123456789" className={FIELD_CONTROL} />
            </Field>
            <Field label="QR de Binance Pay">
              <span className="flex flex-wrap items-center gap-3 pt-1">
                {qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR de Binance Pay" className="size-20 rounded-[14px] border object-cover" />
                ) : (
                  <span className="grid size-20 place-items-center rounded-[14px] border text-center text-xs font-normal text-muted-foreground">Sin QR</span>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="min-w-0 max-w-full text-sm font-normal" />
              </span>
            </Field>
          </>
        )}
        <Field label="Notas adicionales (opcional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Solo en horario laboral" className={FIELD_CONTROL} />
        </Field>
        <SheetActions>
          <Button disabled={pending} onClick={save}>Guardar</Button>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

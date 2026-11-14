"use client";

import { useState } from "react";
import { CreditCardIcon, SparklesIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { SectionCard } from "@/components/shared/SectionCard";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill } from "@/components/shared/Pills";
import { EmptyCard, formatDate, formatUSD, useAction } from "@/components/admin/platform-ui";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { PLANS, parsePlanRequest } from "@/lib/plans";
import { whatsappUrl } from "@/lib/platform-logic";
import { approvePaymentReport, approveUser, denyUser, rejectPaymentReport, resolveCreditRequest } from "@/lib/actions/admin";
import type { PaymentMethod } from "@prisma/client";

export type PendingCompanyRow = { id: string; name: string; ownerId: string; ownerEmail: string; createdAt: Date; plan: string };
export type PendingReportRow = {
  id: string;
  proofImageDataUrl: string | null;
  note: string | null;
  reporterName: string | null;
  reporterPhone: string | null;
  reporterEmail: string | null;
  isLifetime: boolean;
  createdAt: Date;
  company: { name: string };
  lines: { paymentMethod: PaymentMethod; amountUsdCents: number; reference: string | null }[];
};
export type CreditRequestRow = { id: string; credits: number; priceCents: number; reference: string; createdAt: Date; company: { name: string } };

export function ApprovalsView({ companies, reports, credits }: { companies: PendingCompanyRow[]; reports: PendingReportRow[]; credits: CreditRequestRow[] }) {
  const { pending, run } = useAction();
  const [rejecting, setRejecting] = useState<PendingReportRow | null>(null);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<PendingReportRow | null>(null);
  const totalPending = reports.reduce((s, r) => s + r.lines.reduce((a, l) => a + l.amountUsdCents, 0), 0);

  return (
    <div className="flex flex-col gap-3.5">
      <KpiGrid>
        <Kpi label="Registros nuevos" value={companies.length} hint="Esperan aprobación" icon={<UserPlusIcon />} tone={companies.length ? "warn" : "ok"} />
        <Kpi label="Pagos por revisar" value={reports.length} hint={formatUSD(totalPending)} icon={<CreditCardIcon />} tone={reports.length ? "warn" : "ok"} />
        <Kpi label="Créditos IA" value={credits.length} hint="Solicitudes pendientes" icon={<SparklesIcon />} tone={credits.length ? "warn" : "ok"} />
      </KpiGrid>

      <SectionCard title="Registros nuevos pendientes" subtitle="Empresas que esperan que las apruebes">
        {companies.length === 0 ? (
          <EmptyCard>No hay registros pendientes. Las empresas nuevas entran activas con su período de prueba.</EmptyCard>
        ) : (
          companies.map((c) => (
            <Row key={c.id} title={c.name} sub={`${c.ownerEmail} · ${formatDate(c.createdAt)} · Plan ${PLANS[c.plan as keyof typeof PLANS]?.label ?? c.plan}`}>
              <Button disabled={pending} onClick={() => run(() => approveUser(c.ownerId, {}), "Empresa aprobada")}>Aprobar</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => denyUser(c.ownerId), "Empresa rechazada")}>Rechazar</Button>
            </Row>
          ))
        )}
      </SectionCard>

      <SectionCard title="Reportes de pago de suscripción" subtitle="Comprobantes que enviaron las empresas">
        {reports.length === 0 ? (
          <EmptyCard>No hay reportes de pago pendientes.</EmptyCard>
        ) : (
          reports.map((r) => {
            const total = r.lines.reduce((s, l) => s + l.amountUsdCents, 0);
            const plan = parsePlanRequest(r.note);
            const wa = whatsappUrl(r.reporterPhone);
            return (
              <div key={r.id} className="flex flex-col gap-2 border-b py-3 last:border-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block">{r.company.name}</b>
                    <small className="text-xs text-muted-foreground">{formatDate(r.createdAt)} · {r.reporterName ?? "—"}</small>
                  </div>
                  <b className="tabular-nums">{formatUSD(total)}</b>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {plan && <Pill tone="val">Plan solicitado: {PLANS[plan].label}</Pill>}
                  {r.isLifetime && <Pill tone="warn">Pago único de por vida</Pill>}
                  {r.lines.map((l, i) => (
                    <Pill key={i}>{PAYMENT_METHOD_LABELS[l.paymentMethod]} · {formatUSD(l.amountUsdCents)}{l.reference ? ` · ref. ${l.reference}` : ""}</Pill>
                  ))}
                </div>
                {r.reporterEmail && <small className="text-xs text-muted-foreground">{r.reporterEmail}</small>}
                <div className="flex flex-wrap gap-2">
                  <Button disabled={pending} onClick={() => run(() => approvePaymentReport(r.id), "Pago aprobado")}>Aprobar</Button>
                  <Button variant="outline" disabled={pending} onClick={() => { setNote(""); setRejecting(r); }}>Rechazar</Button>
                  {r.proofImageDataUrl && <Button variant="outline" onClick={() => setProof(r)}>Ver comprobante</Button>}
                  {wa && <Button variant="outline" render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>WhatsApp</Button>}
                </div>
              </div>
            );
          })
        )}
      </SectionCard>

      <SectionCard title="Solicitudes de créditos IA" subtitle="Recargas que pagaron las empresas">
        {credits.length === 0 ? (
          <EmptyCard>No hay solicitudes pendientes.</EmptyCard>
        ) : (
          credits.map((r) => (
            <Row key={r.id} title={r.company.name} sub={`${r.credits} créditos · ${formatUSD(r.priceCents)} · ${formatDate(r.createdAt)} · ref. ${r.reference}`}>
              <Button disabled={pending} onClick={() => run(() => resolveCreditRequest(r.id, true), "Créditos sumados a la empresa")}>Aprobar</Button>
              <Button variant="outline" disabled={pending} onClick={() => run(() => resolveCreditRequest(r.id, false), "Solicitud rechazada")}>Rechazar</Button>
            </Row>
          ))
        )}
      </SectionCard>

      {rejecting && (
        <Dialog open onOpenChange={(o) => !o && setRejecting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>¿Rechazar el reporte de {rejecting.company.name}?</DialogTitle>
              <DialogDescription>La empresa podrá reportar el pago de nuevo. Si usó un cupón, se le devuelve.</DialogDescription>
            </DialogHeader>
            <Field label="Motivo (opcional)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD_CONTROL} />
            </Field>
            <SheetActions>
              <Button variant="destructive" disabled={pending} onClick={() => run(() => rejectPaymentReport(rejecting.id, { reviewNote: note }), "Reporte rechazado", () => setRejecting(null))}>
                Rechazar
              </Button>
              <Button variant="outline" onClick={() => setRejecting(null)}>Cancelar</Button>
            </SheetActions>
          </DialogContent>
        </Dialog>
      )}
      {proof?.proofImageDataUrl && (
        <Dialog open onOpenChange={(o) => !o && setProof(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Comprobante · {proof.company.name}</DialogTitle>
            </DialogHeader>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proof.proofImageDataUrl} alt="Comprobante de pago" className="max-h-[70vh] w-full rounded-[14px] object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
      <div className="min-w-0">
        <b className="block truncate">{title}</b>
        <small className="block text-xs text-muted-foreground">{sub}</small>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

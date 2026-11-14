"use client";

import { useMemo, useState } from "react";
import { AlertTriangleIcon, BellIcon, CalendarClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { SectionCard } from "@/components/shared/SectionCard";
import { Pill } from "@/components/shared/Pills";
import { CompanySheet } from "@/components/admin/CompaniesView";
import { EmptyCard, StateBadge, dayLabel, formatDate, formatUSD, useAction } from "@/components/admin/platform-ui";
import { PLANS } from "@/lib/plans";
import { companyState, daysUntilDue, fillTemplate, EMAIL_TEMPLATES, whatsappUrl, EXPIRING_DAYS } from "@/lib/platform-logic";
import { sendDueReminder, type DirectoryRow } from "@/lib/actions/platform";

// Cola de cobranza: empresas que vencen hoy, en 1 a 5 días o ya vencidas, con acciones en un clic.
export function CollectionsView({ rows, nowIso }: { rows: DirectoryRow[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const { pending, run } = useAction();
  const [sheet, setSheet] = useState<{ kind: "pay" | "renew"; id: string } | null>(null);

  const queue = useMemo(
    () =>
      rows
        .filter((c) => c.ownerStatus === "ACTIVE" && !c.isExempt && c.nextPaymentDueDate)
        .map((c) => ({ c, days: daysUntilDue(c.nextPaymentDueDate, now) as number }))
        .filter((x) => x.days <= EXPIRING_DAYS)
        .sort((a, b) => a.days - b.days),
    [rows, now]
  );
  const today = queue.filter((x) => x.days === 0);
  const soon = queue.filter((x) => x.days >= 1);
  const overdue = queue.filter((x) => x.days < 0);
  const target = sheet ? rows.find((r) => r.id === sheet.id) ?? null : null;
  const reminder = EMAIL_TEMPLATES[0];

  const group = (title: string, subtitle: string, items: typeof queue) => (
    <SectionCard title={`${title} (${items.length})`} subtitle={subtitle}>
      {items.length === 0 ? (
        <EmptyCard>Nada por aquí.</EmptyCard>
      ) : (
        items.map(({ c, days }) => {
          const wa = whatsappUrl(c.phone, fillTemplate("Hola {{empresa}}, te escribimos de KR System: tu plan {{plan}} {{dias}} ({{vencimiento}}). ¿Te ayudamos a renovar?", c, now));
          return (
            <div key={c.id} className="flex flex-col gap-2 border-b py-3 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="block truncate">{c.name}</b>
                  <small className="text-xs text-muted-foreground">
                    {c.ownerEmail} · Plan {PLANS[c.plan as keyof typeof PLANS]?.label ?? c.plan}
                    {c.lastPayment ? ` · Último pago ${formatUSD(c.lastPayment.amountUsdCents)} (${formatDate(c.lastPayment.createdAt)})` : " · Sin pagos registrados"}
                  </small>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StateBadge state={companyState(c, now)} />
                  <Pill>{dayLabel(days)}</Pill>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={pending || c.ownerEmail.endsWith("@kyra.local")} onClick={() => run(async () => {
                  const r = await sendDueReminder(c.id);
                  return r.success ? { success: true } : r;
                }, "Recordatorio enviado por correo")}>
                  Recordatorio por correo
                </Button>
                {wa ? (
                  <Button variant="outline" render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>WhatsApp</Button>
                ) : (
                  <Button variant="outline" disabled>Sin teléfono</Button>
                )}
                <Button onClick={() => setSheet({ kind: "pay", id: c.id })}>Registrar pago</Button>
                <Button variant="outline" onClick={() => setSheet({ kind: "renew", id: c.id })}>Renovar</Button>
              </div>
            </div>
          );
        })
      )}
    </SectionCard>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <KpiGrid>
        <Kpi label="Vencen hoy" value={today.length} icon={<BellIcon />} tone={today.length ? "warn" : "ok"} />
        <Kpi label="En 1 a 5 días" value={soon.length} icon={<CalendarClockIcon />} tone={soon.length ? "warn" : "ok"} />
        <Kpi label="Vencidas" value={overdue.length} icon={<AlertTriangleIcon />} tone={overdue.length ? "bad" : "ok"} />
      </KpiGrid>
      {group("Vencen hoy", "Cobrar hoy evita el bloqueo", today)}
      {group("En 1 a 5 días", "Buen momento para un recordatorio", soon)}
      {group("Vencidas", "Ya están bloqueadas hasta que paguen", overdue)}
      {target && sheet && <CompanySheet key={`${sheet.kind}-${target.id}`} kind={sheet.kind} company={target} onClose={() => setSheet(null)} />}
      <p className="text-[13px] text-muted-foreground">El recordatorio por correo usa la plantilla «{reminder.label}».</p>
    </div>
  );
}

import { PlatformShell } from "@/components/admin/PlatformShell";
import { SectionCard, ListRow } from "@/components/shared/SectionCard";
import { FIELD_CONTROL } from "@/components/shared/Field";
import { Pill } from "@/components/shared/Pills";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { listAuditLog } from "@/lib/actions/platform";
import { AUDIT_ACTIONS } from "@/lib/platform-audit";

export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" });

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ action?: string; q?: string; from?: string; to?: string }> }) {
  await requireSuperAdmin();
  const f = await searchParams;
  const rows = await listAuditLog(f);
  const qs = new URLSearchParams({ kind: "auditoria", ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) } as Record<string, string>).toString();
  return (
    <PlatformShell sub="auditoria">
      <SectionCard title="Filtros" subtitle="Cada acción del superadministrador queda registrada con quién, cuándo y a qué empresa">
        <form method="get" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] items-end gap-2.5">
          <select name="action" defaultValue={f.action ?? ""} aria-label="Acción" className={FIELD_CONTROL}>
            <option value="">Todas las acciones</option>
            {Object.entries(AUDIT_ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input name="q" defaultValue={f.q ?? ""} placeholder="Empresa" aria-label="Empresa" className={FIELD_CONTROL} />
          <input name="from" type="date" defaultValue={f.from ?? ""} aria-label="Desde" className={FIELD_CONTROL} />
          <input name="to" type="date" defaultValue={f.to ?? ""} aria-label="Hasta" className={FIELD_CONTROL} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Filtrar</Button>
            <Button variant="outline" render={<a href={`/admin/export?${qs}`} />}>Exportar a Excel (CSV)</Button>
          </div>
        </form>
      </SectionCard>
      <SectionCard title={`Registro (${rows.length})`} subtitle="Los 200 movimientos más recientes que coinciden">
        {rows.length === 0 ? (
          <p className="rounded-[14px] bg-muted px-4 py-6 text-center text-[13px] text-muted-foreground">No hay movimientos con estos filtros.</p>
        ) : (
          rows.map((r) => (
            <ListRow key={r.id}>
              <div>
                <b>{AUDIT_ACTIONS[r.action as keyof typeof AUDIT_ACTIONS] ?? r.action}</b>
                <small>
                  {dt.format(r.createdAt)} · {r.actorEmail}
                  {r.detail ? ` · ${r.detail}` : ""}
                </small>
              </div>
              {r.companyName && <Pill>{r.companyName}</Pill>}
            </ListRow>
          ))
        )}
      </SectionCard>
    </PlatformShell>
  );
}

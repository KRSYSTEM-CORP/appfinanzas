import { PlatformShell } from "@/components/admin/PlatformShell";
import { MailComposer } from "@/components/admin/MailComposer";
import { SectionCard, ListRow } from "@/components/shared/SectionCard";
import { Pill } from "@/components/shared/Pills";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getCompanyDirectory, listCoupons, listEmailLog } from "@/lib/actions/platform";
import { whatsappUrl } from "@/lib/platform-logic";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PlatformMarketingPage() {
  await requireSuperAdmin();
  const [rows, coupons, log] = await Promise.all([getCompanyDirectory(), listCoupons(), listEmailLog(20)]);
  const withPhone = rows.filter((r) => r.ownerStatus === "ACTIVE" && whatsappUrl(r.phone)).slice(0, 30);
  return (
    <PlatformShell sub="marketing">
      <MailComposer rows={rows} coupons={coupons} nowIso={new Date().toISOString()} />

      <SectionCard title="Historial de envíos" subtitle="Los últimos correos masivos, recordatorios y cupones enviados">
        {log.length === 0 ? (
          <p className="rounded-[14px] bg-muted px-4 py-6 text-center text-[13px] text-muted-foreground">Todavía no se ha enviado nada.</p>
        ) : (
          log.map((l) => (
            <ListRow key={l.id}>
              <div>
                <b className="truncate">{l.subject}</b>
                <small>{formatDate(l.createdAt)} · {l.audience}</small>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill tone={l.sent === l.recipients ? "ok" : "warn"}>{l.sent}/{l.recipients}</Pill>
                <Pill>{l.kind === "COUPON" ? "Cupón" : l.kind === "REMINDER" ? "Recordatorio" : "Anuncio"}</Pill>
              </div>
            </ListRow>
          ))
        )}
      </SectionCard>

      <SectionCard title="Seguimiento por WhatsApp" subtitle="Escríbele directo al contacto de la empresa (con el teléfono de su perfil)">
        {withPhone.length === 0 ? (
          <p className="rounded-[14px] bg-muted px-4 py-6 text-center text-[13px] text-muted-foreground">Ninguna empresa activa tiene un teléfono cargado.</p>
        ) : (
          withPhone.map((r) => (
            <ListRow key={r.id}>
              <div>
                <b className="truncate">{r.name}</b>
                <small>{r.ownerName} · {r.phone}</small>
              </div>
              <Button variant="outline" render={<a href={whatsappUrl(r.phone) ?? "#"} target="_blank" rel="noopener noreferrer" />}>WhatsApp</Button>
            </ListRow>
          ))
        )}
      </SectionCard>
    </PlatformShell>
  );
}

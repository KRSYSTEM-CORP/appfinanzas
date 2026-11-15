import { PlatformShell } from "@/components/admin/PlatformShell";
import { AnnouncementsView } from "@/components/admin/AnnouncementsView";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { listAnnouncements } from "@/lib/actions/platform";

export const dynamic = "force-dynamic";

export default async function PlatformAnnouncementsPage() {
  await requireSuperAdmin();
  const items = await listAnnouncements();
  return (
    <PlatformShell sub="anuncios">
      <AnnouncementsView items={items} nowIso={new Date().toISOString()} />
    </PlatformShell>
  );
}

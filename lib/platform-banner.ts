import { prisma } from "@/lib/prisma";
import { announcementVisible, inSegment, isSegment, type PlatformCompany } from "@/lib/platform-logic";
import type { Session } from "@/lib/session";

export type BannerItem = { id: string; title: string; body: string; tone: string };

// Avisos de la Plataforma vigentes para la empresa de esta sesión (todas, o su segmento).
// Tabla global sin RLS (como PlatformSettings); no es una acción de servidor.
export async function getActiveBanners(session: Session): Promise<BannerItem[]> {
  const now = new Date();
  const all = await prisma.platformAnnouncement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 5 });
  const live = all.filter((a) => announcementVisible(a, now));
  if (live.length === 0) return [];
  const needsCompany = live.some((a) => a.segment);
  let createdAt = now;
  if (needsCompany) {
    const c = await prisma.company.findUnique({ where: { id: session.companyId }, select: { createdAt: true } });
    createdAt = c?.createdAt ?? now;
  }
  const me: PlatformCompany = {
    id: session.companyId,
    name: session.companyName,
    plan: session.plan,
    isExempt: session.isExempt,
    nextPaymentDueDate: session.nextPaymentDueDate,
    ownerStatus: "ACTIVE",
    ownerEmail: "",
    createdAt,
    // «Sin actividad» no se evalúa en el banner (se trata como activa).
    lastActivityAt: now,
  };
  return live
    .filter((a) => !a.segment || (isSegment(a.segment) && inSegment(me, a.segment, now)))
    .map((a) => ({ id: a.id, title: a.title, body: a.body, tone: a.tone }));
}

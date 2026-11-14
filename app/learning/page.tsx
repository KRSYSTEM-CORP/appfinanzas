import { getSession } from "@/lib/session";
import { GraduationCapIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { IconTile } from "@/components/ui/icon-tile";
import { LearningPanel } from "@/components/learning/LearningPanel";
import { getLearningStats, isLearningAdmin, isLearningStorageReady, listLearningVideos } from "@/lib/actions/learning";
import { MAX_LEARNING_UPLOAD_BYTES, MAX_LEARNING_VIDEOS } from "@/lib/learning";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const session = await getSession();
  // «Para ti»: la ruta que corresponde al rol de quien entra (rol personalizado si coincide con una ruta).
  const defaultRoute =
    session?.roleName && ["Dueño", "Cajero", "Vendedor", "Contador"].includes(session.roleName)
      ? session.roleName
      : session?.role === "GERENTE"
        ? "Dueño"
        : "Vendedor";
  const [videos, admin, storageReady, stats] = await Promise.all([
    listLearningVideos(),
    isLearningAdmin(),
    isLearningStorageReady(),
    getLearningStats(),
  ]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <PageHeader eyebrow="Academia KR POS" title="Learning">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-2.5 py-[3px] text-xs font-semibold text-primary">
            <GraduationCapIcon className="size-3.5" aria-hidden /> {videos.length ? Math.round((videos.filter((v) => v.watched).length / videos.length) * 100) : 0} % completado
          </span>
        </div>
      </PageHeader>
      <div role="note" className="flex flex-wrap items-center gap-3 rounded-[19px] bg-card px-4 py-3.5 shadow-(--shadow-card)">
        <IconTile>
          <GraduationCapIcon className="size-[22px]" aria-hidden />
        </IconTile>
        <div className="min-w-[200px] flex-1">
          <b>Contenido creado por el equipo de KR System</b>
          <p className="text-[13px] text-muted-foreground">Aprende a tu ritmo. Tu progreso se guarda por usuario y puedes practicar cada módulo en tu propio sistema.</p>
        </div>
      </div>
      <LearningPanel
        videos={videos}
        stats={stats}
        isAdmin={admin}
        storageReady={storageReady}
        max={MAX_LEARNING_VIDEOS}
        maxUploadMb={MAX_LEARNING_UPLOAD_BYTES / 1024 / 1024}
        defaultRoute={defaultRoute}
      />
    </div>
  );
}

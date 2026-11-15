import { PlatformShell } from "@/components/admin/PlatformShell";
import { LearningPanel } from "@/components/learning/LearningPanel";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { getLearningStats, isLearningAdmin, isLearningStorageReady, listLearningVideos } from "@/lib/actions/learning";
import { MAX_LEARNING_UPLOAD_BYTES, MAX_LEARNING_VIDEOS } from "@/lib/learning";

export const dynamic = "force-dynamic";

// Plataforma → Aprendizaje: subir, ordenar, publicar u ocultar y quitar los videos de Learning.
// Usa el mismo panel y las mismas acciones (lib/actions/learning.ts) que el módulo Learning,
// que sigue mostrando esos videos a todas las empresas.
export default async function PlatformLearningPage() {
  await requireSuperAdmin();
  const [videos, admin, storageReady, stats] = await Promise.all([listLearningVideos(), isLearningAdmin(), isLearningStorageReady(), getLearningStats()]);
  return (
    <PlatformShell sub="aprendizaje">
      {!admin && (
        <p role="note" className="rounded-[19px] bg-card px-4 py-3.5 text-[13px] text-muted-foreground shadow-(--shadow-card)">
          Solo la cuenta propietaria de la plataforma puede subir o quitar videos. Aquí ves la biblioteca en modo lectura.
        </p>
      )}
      <LearningPanel
        videos={videos}
        stats={stats}
        isAdmin={admin}
        storageReady={storageReady}
        max={MAX_LEARNING_VIDEOS}
        maxUploadMb={MAX_LEARNING_UPLOAD_BYTES / 1024 / 1024}
        defaultRoute="Dueño"
      />
    </PlatformShell>
  );
}

import { LearningPanel } from "@/components/learning/LearningPanel";
import { isLearningAdmin, isLearningStorageReady, listLearningVideos } from "@/lib/actions/learning";
import { MAX_LEARNING_UPLOAD_BYTES, MAX_LEARNING_VIDEOS } from "@/lib/learning";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const [videos, admin, storageReady] = await Promise.all([
    listLearningVideos(),
    isLearningAdmin(),
    isLearningStorageReady(),
  ]);
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <p className="kr-eyebrow">Aprende con videos cortos</p>
        <h1 className="kr-h1">Learning</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Videos cortos para aprender a sacarle el máximo a KR POS.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-[20px] bg-card p-4 shadow-(--shadow-card)">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5Z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></svg>
        </span>
        <div>
          <p className="text-sm font-bold">Contenido creado por el equipo de KR System</p>
          <p className="text-sm text-muted-foreground">Aprende a tu ritmo. Tu progreso se guarda por usuario.</p>
        </div>
      </div>
      <LearningPanel
        videos={videos}
        isAdmin={admin}
        storageReady={storageReady}
        max={MAX_LEARNING_VIDEOS}
        maxUploadMb={MAX_LEARNING_UPLOAD_BYTES / 1024 / 1024}
      />
    </div>
  );
}

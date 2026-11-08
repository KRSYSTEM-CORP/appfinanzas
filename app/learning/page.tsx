import { LearningPanel } from "@/components/learning/LearningPanel";
import { isLearningAdmin, listLearningVideos } from "@/lib/actions/learning";
import { MAX_LEARNING_VIDEOS } from "@/lib/learning";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const [videos, admin] = await Promise.all([listLearningVideos(), isLearningAdmin()]);
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Learning</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Videos cortos para aprender a sacarle el máximo a KR POS.
        </p>
      </div>
      <LearningPanel videos={videos} isAdmin={admin} max={MAX_LEARNING_VIDEOS} />
    </div>
  );
}

-- Sección Learning: videos de la plataforma (sin companyId, igual para todos) y avance por usuario.
CREATE TABLE "LearningVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "r2Key" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LearningVideo_position_idx" ON "LearningVideo"("position");

CREATE TABLE "LearningProgress" (
    "userId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningProgress_pkey" PRIMARY KEY ("userId", "videoId")
);
CREATE INDEX "LearningProgress_videoId_idx" ON "LearningProgress"("videoId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "LearningVideo" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "LearningProgress" TO app_runtime;
  END IF;
END
$$;

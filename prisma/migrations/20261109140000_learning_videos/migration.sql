-- Sección Learning: videos de la plataforma (sin companyId, igual para todos).
CREATE TABLE "LearningVideo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LearningVideo_position_idx" ON "LearningVideo"("position");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "LearningVideo" TO app_runtime;
  END IF;
END
$$;

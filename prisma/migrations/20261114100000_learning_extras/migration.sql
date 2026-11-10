-- Learning: ruta sugerida, estado (publicado/oculto) y puntos de «lo que aprendes» (aditiva).
ALTER TABLE "LearningVideo" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'Todo';
ALTER TABLE "LearningVideo" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LearningVideo" ADD COLUMN "learns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

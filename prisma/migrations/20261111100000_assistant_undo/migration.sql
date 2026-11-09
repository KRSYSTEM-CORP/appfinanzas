-- Deshacer cambios del Asistente IA durante 24 h sin costo (aditiva).
ALTER TABLE "AssistantEntry" ADD COLUMN "appliedAt" TIMESTAMP(3);
ALTER TABLE "AssistantEntry" ADD COLUMN "undoData" JSONB;
ALTER TABLE "AssistantEntry" ADD COLUMN "undone" BOOLEAN NOT NULL DEFAULT false;

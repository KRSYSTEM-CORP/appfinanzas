-- Asistente IA: créditos por empresa y tope diario de consultas.
ALTER TABLE "Company" ADD COLUMN "aiCreditsExtra" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiCreditsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Company" ADD COLUMN "aiPeriod" TEXT;
ALTER TABLE "Company" ADD COLUMN "aiAskDay" TEXT;
ALTER TABLE "Company" ADD COLUMN "aiAskCount" INTEGER NOT NULL DEFAULT 0;

-- Planes de suscripción. Las empresas existentes quedan en CORPORATIVO (sin recortes).
CREATE TYPE "PlanTier" AS ENUM ('EMPRENDE', 'PYME', 'CORPORATIVO');
ALTER TABLE "Company" ADD COLUMN "plan" "PlanTier" NOT NULL DEFAULT 'CORPORATIVO';

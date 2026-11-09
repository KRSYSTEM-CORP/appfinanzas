-- Seguimiento de presupuestos: enviado, visto y motivo de pérdida (aditiva, todo opcional).
ALTER TABLE "Quote" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "lostReason" TEXT;

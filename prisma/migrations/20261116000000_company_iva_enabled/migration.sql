-- Aditiva: interruptor para que la empresa decida si usa IVA. Por defecto activado.
ALTER TABLE "Company" ADD COLUMN "ivaEnabled" BOOLEAN NOT NULL DEFAULT true;

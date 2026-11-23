-- Días gratis que el administrador de la plataforma regala a empresas nuevas (aditiva: columna con valor por defecto 0).
ALTER TABLE "Company" ADD COLUMN     "freeDaysGranted" INTEGER NOT NULL DEFAULT 0;

-- Reporte diario por correo (aditiva).
ALTER TABLE "Company" ADD COLUMN "dailyReportEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Reporte semanal por correo, opt-in por empresa (aditiva).
ALTER TABLE "Company" ADD COLUMN "weeklyReportEnabled" BOOLEAN NOT NULL DEFAULT false;

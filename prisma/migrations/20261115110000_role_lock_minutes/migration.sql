-- Minutos de bloqueo por inactividad de cada rol (aditiva).
ALTER TABLE "CompanyRole" ADD COLUMN "lockMinutes" INTEGER;

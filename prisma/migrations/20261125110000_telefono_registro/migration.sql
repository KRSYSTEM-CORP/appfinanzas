-- Teléfono de contacto del dueño, obligatorio al registrarse (aditiva: columna opcional; las empresas anteriores quedan sin él).
ALTER TABLE "Company" ADD COLUMN     "ownerPhone" TEXT;

-- Datos de contacto de quien reporta el pago de la suscripción (nombre, teléfono, correo opcional).
ALTER TABLE "PaymentReport" ADD COLUMN "reporterName" TEXT;
ALTER TABLE "PaymentReport" ADD COLUMN "reporterPhone" TEXT;
ALTER TABLE "PaymentReport" ADD COLUMN "reporterEmail" TEXT;

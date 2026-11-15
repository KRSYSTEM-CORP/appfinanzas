-- Compra de créditos IA con el mismo flujo de la suscripción: método, contacto y comprobante (aditiva).

-- AlterTable
ALTER TABLE "AiCreditRequest" ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "proofImageDataUrl" TEXT,
ADD COLUMN     "reporterEmail" TEXT,
ADD COLUMN     "reporterName" TEXT,
ADD COLUMN     "reporterPhone" TEXT;


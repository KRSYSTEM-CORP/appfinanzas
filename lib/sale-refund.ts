// Concepto de la salida de Caja Chica que registra la devolución de dinero al anular una venta.
// Sin dependencias de servidor para poder probarlo en vitest.
export function refundConcept(saleNumber: number | string): string {
  return `Devolución por anulación de venta N.º ${saleNumber}`;
}

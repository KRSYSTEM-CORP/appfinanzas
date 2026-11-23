// «code» distingue errores que la pantalla puede resolver con un botón: INSUFFICIENT_FUNDS = la cuenta de
// origen no tiene saldo (lleva el id de la cuenta y lo que falta, en la moneda de la cuenta).
export type ActionResult =
  | { success: true }
  | { success: false; error: string; code?: "INSUFFICIENT_FUNDS"; accountId?: string; shortfallCents?: number; accountCurrency?: string };

// Resultado de reportar un pago: devuelve el id del reporte para poder enviarlo por WhatsApp o reenviarlo.
export type ReportResult = { success: true; reportId: string } | { success: false; error: string };

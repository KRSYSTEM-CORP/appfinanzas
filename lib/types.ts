export type ActionResult = { success: true } | { success: false; error: string };

// Resultado de reportar un pago: devuelve el id del reporte para poder enviarlo por WhatsApp o reenviarlo.
export type ReportResult = { success: true; reportId: string } | { success: false; error: string };

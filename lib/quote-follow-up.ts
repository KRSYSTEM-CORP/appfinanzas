// Motivos de pérdida de un presupuesto (lista cerrada, como en la preview).
export const QUOTE_LOST_REASONS = ["Precio", "Compró en otro lado", "Sin respuesta", "Otro"] as const;
export type QuoteLostReason = (typeof QUOTE_LOST_REASONS)[number];

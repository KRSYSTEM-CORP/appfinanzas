// Grupos de clientes (mapa de clientes) y mensajes de WhatsApp de Marketing (preview 05 · #mkt).

// Cuadrantes del mapa: frecuencia de visitas (5 o más = viene seguido) y gasto ($300 o más = gasta bien).
export const SEGMENTS = [
  { id: "campeones", label: "Campeones", hint: "Vienen seguido y gastan bien" },
  { id: "leales", label: "Leales", hint: "Vienen seguido, gastan poco" },
  { id: "riesgo", label: "En riesgo", hint: "Gastan bien pero vienen poco" },
  { id: "dormidos", label: "Dormidos", hint: "Poca visita y poco gasto" },
] as const;
export type SegmentId = (typeof SEGMENTS)[number]["id"];

export const FREQUENT_VISITS = 6; // KPI «Frecuentes»: 6 visitas o más
export const MAP_FREQUENT_VISITS = 5; // Mapa: frecuente = 5 visitas o más
export const MAP_SPEND_CENTS = 30_000; // Mapa: arriba gastan $300 o más
export const INACTIVE_DAYS = 45;
export const NEW_CUSTOMER_DAYS = 30;

export function segmentOf(visits: number, spentCents: number): SegmentId {
  const f = visits >= MAP_FREQUENT_VISITS;
  const g = spentCents >= MAP_SPEND_CENTS;
  return f && g ? "campeones" : f ? "leales" : g ? "riesgo" : "dormidos";
}

// Listas de clientes para una promoción (mismo orden que la preview).
export const PROMO_LISTS = [
  { id: "campeones", label: "Campeones" },
  { id: "leales", label: "Leales" },
  { id: "riesgo", label: "En riesgo" },
  { id: "dormidos", label: "Dormidos" },
  { id: "cumpleaneros", label: "Cumpleañeros" },
  { id: "todos", label: "Todos los clientes" },
] as const;
export type PromoListId = (typeof PROMO_LISTS)[number]["id"];

// Código sugerido según la lista y el descuento (VUELVE15, GRACIAS10…).
export function promoCode(list: PromoListId, percent: number): string {
  const base = { campeones: "GRACIAS", leales: "LEAL", riesgo: "VUELVE", dormidos: "VUELVE", cumpleaneros: "CUMPLE", todos: "KRPOS" }[list];
  return `${base}${Math.max(0, Math.round(percent))}`;
}

// Código válido: letras y números, de 3 a 14 caracteres, en mayúsculas.
export function normalizePromoCode(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 14);
}

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function shortDate(d: Date | string): string {
  const x = new Date(d);
  return `${x.getUTCDate()} ${SHORT[x.getUTCMonth()]}`;
}

// Enlace de WhatsApp con el mensaje escrito (mismo método con el que se envían los documentos).
export function whatsappLink(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// Mensaje de la promoción, tal cual la vista previa de WhatsApp de la preview.
export function promotionMessage(p: { code: string; discountPercent: number; validUntil: Date | string; firstName?: string }, businessName: string): string {
  return `Hola ${p.firstName?.trim() || "cliente"}, te saluda ${businessName}. Tenemos un detalle para ti: usa el código ${p.code} y recibe ${p.discountPercent} % de descuento en tu próxima compra. Válido hasta el ${shortDate(p.validUntil)}. ¡Te esperamos!`;
}

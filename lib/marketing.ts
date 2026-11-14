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

// ───────── Segmentación de promociones y canje de cupón ─────────

export const PROMO_SEGMENT_IDS = ["todos", "campeones", "leales", "riesgo", "dormidos", "cumpleaneros", "clientes"] as const;
export type PromoSegmentId = (typeof PROMO_SEGMENT_IDS)[number];

export function promoSegmentLabel(segment: string): string {
  if (segment === "clientes") return "Clientes elegidos";
  return PROMO_LISTS.find((l) => l.id === segment)?.label ?? segment;
}

// Día y mes (sin año) de una fecha ISO o AAAA-MM-DD, en UTC.
function monthDay(d: Date | string): number {
  const x = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00Z`) : new Date(d);
  return (x.getUTCMonth() + 1) * 100 + x.getUTCDate();
}

// ¿El cumpleaños cae dentro del periodo (desde/hasta, ambos incluidos)? Solo cuentan día y mes; el año se ignora.
// Un periodo que cruza fin de año (dic → ene) también funciona.
export function birthdayInRange(birthDate: Date | string | null | undefined, from: string | null | undefined, to: string | null | undefined): boolean {
  if (!birthDate || !from || !to) return false;
  const b = monthDay(birthDate);
  const f = monthDay(from);
  const t = monthDay(to);
  // Un periodo de un año o más cubre todos los cumpleaños.
  if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) >= 364 * 86_400_000) return true;
  return f <= t ? b >= f && b <= t : b >= f || b <= t;
}

export type PromoTarget = { segment: string; rangeFrom?: string | null; rangeTo?: string | null; customerIds?: string[] | null };
export type TargetCustomer = { id: string | null; segment: SegmentId; birthDate: Date | string | null };

// ¿Este cliente forma parte del público de la promoción?
export function customerInPromo(promo: PromoTarget, c: TargetCustomer): boolean {
  switch (promo.segment) {
    case "todos":
      return true;
    case "cumpleaneros":
      return birthdayInRange(c.birthDate, promo.rangeFrom, promo.rangeTo);
    case "clientes":
      return c.id != null && (promo.customerIds ?? []).includes(c.id);
    default:
      return promo.segment === c.segment;
  }
}

export type CouponCheck = { ok: true; discountPercent: number } | { ok: false; error: string };
export const COUPON_INVALID = "Cupón no válido";

// Validación del cupón en el POS (y otra vez en el servidor al cobrar). Todo rechazo trae un mensaje claro para el cajero.
export function checkCoupon(
  promo: (PromoTarget & { discountPercent: number; validUntil: Date | string }) | null,
  customer: TargetCustomer | null,
  alreadyRedeemed: boolean,
  now: Date = new Date()
): CouponCheck {
  if (!promo) return { ok: false, error: COUPON_INVALID };
  if (new Date(promo.validUntil).getTime() < now.getTime()) return { ok: false, error: "Cupón vencido" };
  if (!customer) return { ok: false, error: "Selecciona un cliente (nombre y apellido) para canjear el cupón" };
  if (!customerInPromo(promo, customer)) return { ok: false, error: "Este cupón no está disponible para este cliente" };
  if (alreadyRedeemed) return { ok: false, error: "Este cliente ya canjeó este cupón" };
  return { ok: true, discountPercent: promo.discountPercent };
}

// Descuento (céntimos) de un cupón porcentual sobre un subtotal bruto; mismo redondeo que el servidor por línea.
export function couponDiscountCents(rawCents: number, percent: number): number {
  return Math.round((rawCents * Math.max(0, Math.min(100, percent))) / 100);
}

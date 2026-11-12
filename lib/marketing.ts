// Grupos de clientes (mapa de clientes) y mensajes de WhatsApp de Marketing.

export const SEGMENTS = [
  { id: "campeones", label: "Campeones", hint: "Compran seguido y gastan bien" },
  { id: "leales", label: "Leales", hint: "Activos, vuelven con regularidad" },
  { id: "riesgo", label: "En riesgo", hint: "De 46 a 90 días sin comprar" },
  { id: "dormidos", label: "Dormidos", hint: "Más de 90 días sin comprar" },
] as const;
export type SegmentId = (typeof SEGMENTS)[number]["id"];

export const FREQUENT_VISITS = 6;
export const INACTIVE_DAYS = 45;

export function segmentOf(visits: number, spentCents: number, avgSpentCents: number, lastVisit: Date | null, now = new Date()): SegmentId {
  const days = lastVisit ? Math.floor((now.getTime() - lastVisit.getTime()) / 86_400_000) : Infinity;
  if (days > 90) return "dormidos";
  if (days > INACTIVE_DAYS) return "riesgo";
  if (visits >= FREQUENT_VISITS || (avgSpentCents > 0 && spentCents >= avgSpentCents * 2)) return "campeones";
  return "leales";
}

// Enlace de WhatsApp con el mensaje escrito (mismo método con el que se envían los documentos).
export function whatsappLink(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `58${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function promotionMessage(p: { name: string; code: string; discountPercent: number; validUntil: Date | string }, businessName: string): string {
  const until = new Date(p.validUntil).toLocaleDateString("es-VE", { day: "numeric", month: "long" });
  return `Hola 👋 de parte de ${businessName}: ${p.name}. Usa el código ${p.code} y obtén ${p.discountPercent} % de descuento. Válido hasta el ${until}.`;
}

// Teléfono de contacto del dueño al registrarse. Se guarda en formato internacional (+584121234567) para poder
// escribirle por WhatsApp (https://wa.me/584121234567). Acepta cómo lo escribe la gente en Venezuela:
// 0412-1234567, 412 1234567, +58 412 123 4567, (0412) 123.45.67… y números de otros países con su código (+57 300 1234567).

export const PHONE_ERROR = "Escribe un número de teléfono válido, con WhatsApp si es posible. Ej: 0412 1234567.";

// Devuelve +<código><número> o null si no parece un teléfono real (8 a 15 dígitos en total).
export function normalizeContactPhone(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  // Solo dígitos, espacios y los separadores habituales; cualquier otra cosa (letras, @…) no es un teléfono.
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (!hasPlus) {
    // 00 + código internacional (00584121234567).
    if (digits.startsWith("00")) digits = digits.slice(2);
    // Venezuela: 0412 1234567 / 412 1234567 / 0212 1234567 (10 dígitos sin el 0, o 11 con él).
    else if (digits.length === 11 && digits.startsWith("0")) digits = `58${digits.slice(1)}`;
    else if (digits.length === 10 && /^[24]/.test(digits)) digits = `58${digits}`;
    // Con el 58 delante y un 0 de más (58 0412…): se quita.
    else if (digits.startsWith("580") && digits.length === 13) digits = `58${digits.slice(3)}`;
  } else if (digits.startsWith("580") && digits.length === 13) {
    digits = `58${digits.slice(3)}`;
  }
  if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
  // Venezuela tiene siempre 12 dígitos (58 + 10).
  if (digits.startsWith("58") && digits.length !== 12) return null;
  return `+${digits}`;
}

// Enlace para escribirle por WhatsApp.
export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

// Para mostrarlo legible: +58 412 123 4567.
export function formatContactPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("58") && d.length === 12) return `+58 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
  return `+${d}`;
}

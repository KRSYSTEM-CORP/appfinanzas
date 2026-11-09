import { createHmac } from "crypto";

// PIN de la persona: 4 a 6 números. Es un candado de pantalla sobre una sesión de
// empresa ya autenticada (no reemplaza la contraseña): desbloquear pide elegir el
// perfil y escribir el PIN, con límite de intentos (lib/actions/pin.ts).

export const PIN_PATTERN = /^\d{4,6}$/;

// null si el PIN sirve; si no, el motivo para mostrarlo tal cual.
export function pinProblem(pin: string): string | null {
  if (!PIN_PATTERN.test(pin)) return "El PIN debe tener de 4 a 6 números";
  if (/^(\d)\1+$/.test(pin)) return "El PIN no puede ser el mismo número repetido";
  // Secuencias ascendentes o descendentes, también las que dan la vuelta (7890, 9012).
  if ("01234567890123456789".includes(pin) || "98765432109876543210".includes(pin)) {
    return "El PIN no puede ser una secuencia (1234, 4321…)";
  }
  return null;
}

// Huella del PIN dentro de una empresa, solo para impedir repetidos. Lleva
// AUTH_SECRET (que no está en la base de datos), así que un volcado de la base no
// permite adivinar PINs con ella.
export function computePinKey(secret: string, companyId: string, pin: string): string {
  return createHmac("sha256", secret).update(`${companyId}:${pin}`).digest("hex");
}

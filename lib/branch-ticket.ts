import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Permiso de corta duración para elegir sucursal después de iniciar sesión. El correo, la contraseña y la verificación de
// Cloudflare ya se comprobaron en el primer paso; este permiso (firmado en el servidor, 5 minutos, solo sirve para elegir
// una sucursal de ESA empresa) evita repetir la verificación y guardar la contraseña en el navegador.
// Se firma con una clave derivada distinta a la de la sesión para que nunca se pueda usar como cookie de sesión.

const TTL_MS = 5 * 60 * 1000;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no está configurado");
  return `${s}|branch-ticket`;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function signBranchTicket(userId: string, companyId: string, now: number = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ u: userId, c: companyId, e: now + TTL_MS, p: "branch" })).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifyBranchTicket(token: string, now: number = Date.now()): { userId: string; companyId: string } | null {
  const [data, sig] = (token ?? "").split(".");
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as { u?: string; c?: string; e?: number; p?: string };
    if (p.p !== "branch" || !p.u || !p.c || typeof p.e !== "number" || p.e < now) return null;
    return { userId: p.u, companyId: p.c };
  } catch {
    return null;
  }
}

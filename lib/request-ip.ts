import "server-only";
import { headers } from "next/headers";

// El cliente puede mandar su propio x-forwarded-for: un proxy honesto AÑADE la IP
// real al final, así que se usa x-real-ip (lo fija el proxy) o, si no, el ÚLTIMO
// salto de la lista (nunca el primero, que lo controla quien hace la petición).
// Sin cabeceras (dev local) cae a una clave constante.
export function pickClientIp(realIp: string | null, forwarded: string | null): string {
  const real = realIp?.trim();
  if (real) return real;
  const hops = (forwarded ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1] : "unknown";
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return pickClientIp(h.get("x-real-ip"), h.get("x-forwarded-for"));
}

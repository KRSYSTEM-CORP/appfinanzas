import { NextResponse } from "next/server";

// Recibe los avisos de la Content-Security-Policy en modo "solo reporte".
// Cada aviso es una línea en el registro del servidor con lo mínimo para actuar:
// la regla violada, el origen bloqueado y la ruta de la página (sin parámetros).
// No se guarda nada en la base de datos ni se lee la IP ni el agente de usuario.
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_LINES_PER_MINUTE = 60;
let windowStart = 0;
let linesInWindow = 0;

function allow(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    linesInWindow = 0;
  }
  return ++linesInWindow <= MAX_LINES_PER_MINUTE;
}

// Solo esquema + host; "inline", "eval" y similares pasan tal cual.
function origin(value: unknown): string {
  if (typeof value !== "string" || !value) return "-";
  try {
    const u = new URL(value);
    return u.protocol === "data:" || u.protocol === "blob:" ? u.protocol : u.origin;
  } catch {
    return value.slice(0, 20);
  }
}

function path(value: unknown): string {
  if (typeof value !== "string") return "-";
  try {
    return new URL(value).pathname.slice(0, 80);
  } catch {
    return "-";
  }
}

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES || !allow()) return new NextResponse(null, { status: 204 });
  try {
    const json = JSON.parse(text);
    const list = Array.isArray(json) ? json.map((r) => r?.body) : [json?.["csp-report"]];
    for (const r of list.slice(0, 5)) {
      if (!r) continue;
      const directive = String(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "?").slice(0, 40);
      const blocked = origin(r["blocked-uri"] ?? r.blockedURL);
      const page = path(r["document-uri"] ?? r.documentURL);
      console.warn(`[csp] ${directive} bloqueó ${blocked} en ${page}`);
    }
  } catch {
    // Cuerpo mal formado: se ignora.
  }
  return new NextResponse(null, { status: 204 });
}

// Columna "Imagen" de las cargas masivas (Importar / Actualizar inventario).
// La celda trae una URL https de una imagen; el servidor la descarga y la
// guarda en Product.imageDataUrl igual que el alta normal (data URL), así que
// el límite coincide con ProductSchema.image (< 700_000 caracteres).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const MAX_IMAGE_URL_LENGTH = 2000;
// 480 KB en binario ≈ 640 K caracteres en base64: cabe en el tope de 700 K.
export const MAX_IMAGE_BYTES = 480_000;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8000;

export type ImageCell = { kind: "blank" } | { kind: "url"; url: string } | { kind: "error"; error: string };

// Validación pura de la celda (se usa en el cliente y en el servidor).
export function parseImageUrlCell(value: unknown): ImageCell {
  if (value == null) return { kind: "blank" };
  const text = String(value).trim();
  if (text === "") return { kind: "blank" };
  if (text.length > MAX_IMAGE_URL_LENGTH) return { kind: "error", error: "La URL de la imagen es demasiado larga" };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { kind: "error", error: "La imagen debe ser una URL válida (https://...)" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { kind: "error", error: "La imagen debe ser una URL http o https" };
  }
  if (parsed.username || parsed.password) return { kind: "error", error: "La URL de la imagen no puede incluir credenciales" };
  return { kind: "url", url: parsed.toString() };
}

// true para direcciones locales/privadas/reservadas (anti-SSRF).
export function isPrivateAddress(address: string): boolean {
  const v = isIP(address);
  if (v === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0)
    );
  }
  if (v === 6) {
    const l = address.toLowerCase();
    if (l === "::" || l === "::1") return true;
    if (l.startsWith("::ffff:")) return isPrivateAddress(l.slice(7));
    return l.startsWith("fc") || l.startsWith("fd") || /^fe[89ab]/.test(l);
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("La URL de la imagen no es pública");
  }
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("La URL de la imagen no es pública");
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error("La URL de la imagen no es pública");
  }
}

export function detectImageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length > 6 && ascii(0, 3) === "GIF") return "image/gif";
  return null;
}

// Descarga la imagen (solo datos, nunca se ejecuta) y la devuelve como data URL.
export async function fetchImageAsDataUrl(
  url: string
): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const cell = parseImageUrlCell(current);
      if (cell.kind !== "url") return { ok: false, error: cell.kind === "error" ? cell.error : "URL de imagen inválida" };
      await assertPublicHost(new URL(cell.url).hostname);
      const res = await fetch(cell.url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "image/*" },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, error: "No se pudo descargar la imagen" };
        current = new URL(loc, cell.url).toString();
        continue;
      }
      if (!res.ok) return { ok: false, error: "No se pudo descargar la imagen" };
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_IMAGE_BYTES) return { ok: false, error: "La imagen es demasiado grande (máx. 480 KB)" };
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: "La imagen es demasiado grande (máx. 480 KB)" };
      const type = detectImageType(bytes);
      if (!type || !ALLOWED_TYPES.includes(type)) {
        return { ok: false, error: "El enlace no es una imagen JPG, PNG, WEBP o GIF" };
      }
      return { ok: true, dataUrl: `data:${type};base64,${Buffer.from(bytes).toString("base64")}` };
    }
    return { ok: false, error: "Demasiadas redirecciones al descargar la imagen" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error && e.message.includes("pública") ? e.message : "No se pudo descargar la imagen",
    };
  }
}

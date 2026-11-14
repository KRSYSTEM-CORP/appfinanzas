// Columna "Imagen" de las cargas masivas (Importar / Actualizar inventario).
// La celda trae una URL https de una imagen; el servidor la descarga y la
// guarda en Product.imageDataUrl igual que el alta normal (data URL), así que
// el límite coincide con ProductSchema.image (< 700_000 caracteres).

export const MAX_IMAGE_URL_LENGTH = 2000;
// 480 KB en binario ≈ 640 K caracteres en base64: cabe en el tope de 700 K.
export const MAX_IMAGE_BYTES = 480_000;

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

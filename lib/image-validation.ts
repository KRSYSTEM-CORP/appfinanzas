// Validación de imágenes recibidas como data URL (logos, fotos de producto, QR, comprobantes).
// Comprueba el tipo REAL por los primeros bytes (no solo el prefijo declarado), rechaza SVG y
// formatos que el navegador podría interpretar como documento, y limita el tamaño.
const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/]+=*)$/;

function matchesMagic(kind: string, b: Uint8Array): boolean {
  if (kind === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (kind === "jpeg" || kind === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (kind === "gif") return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38;
  if (kind === "webp")
    return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return false;
}

export function isSafeImageDataUrl(value: string, maxChars: number): boolean {
  if (value.length > maxChars) return false;
  const m = DATA_URL_RE.exec(value);
  if (!m) return false;
  try {
    const head = Buffer.from(m[2].slice(0, 24), "base64");
    return matchesMagic(m[1], head);
  } catch {
    return false;
  }
}

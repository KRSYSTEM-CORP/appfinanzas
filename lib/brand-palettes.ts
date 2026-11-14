// Paletas recomendadas de Ajustes → Marca: cada color dominante del logo da una paleta
// (color principal + fondo suave del mismo tono). Puro, sin React.
export type BrandPalette = { name: string; color: string; background: string };

const NAMES = ["Identidad del logo", "Segundo color del logo", "Tercer color del logo", "Cuarto color del logo"];

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Mezcla el color con blanco (por defecto 94 % blanco): un fondo claro con el tono de la marca.
export function tintBackground(hex: string, whiteShare = 0.94): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#f9f9f7";
  const [r, g, b] = rgb.map((v) => Math.round(v * (1 - whiteShare) + 255 * whiteShare));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function buildPalettes(colors: string[]): BrandPalette[] {
  return colors
    .filter((c) => parseHex(c))
    .slice(0, NAMES.length)
    .map((c, i) => ({ name: NAMES[i], color: c.toLowerCase(), background: tintBackground(c) }));
}

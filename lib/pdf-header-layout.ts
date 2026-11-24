// Cálculo puro (sin jsPDF) del bloque del nombre de empresa en los PDF:
// elige el tamaño de letra más grande (entre max y min) con que el nombre
// cabe en `maxLines` líneas al ancho disponible; si ni siquiera al mínimo
// cabe, se queda en el mínimo y deja que el nombre ocupe las líneas que
// necesite (nunca se recorta ni se pasa del ancho).
export type SplitFn = (text: string, fontSize: number, maxWidth: number) => string[];

export interface NameLayout {
  fontSize: number;
  lines: string[];
}

export function layoutCompanyName(
  name: string,
  maxWidth: number,
  split: SplitFn,
  opts: { maxSize?: number; minSize?: number; maxLines?: number; step?: number } = {}
): NameLayout {
  const { maxSize = 15, minSize = 9, maxLines = 2, step = 0.5 } = opts;
  const text = name.trim() || " ";
  let size = maxSize;
  while (size >= minSize) {
    const lines = split(text, size, maxWidth);
    if (lines.length <= maxLines) return { fontSize: size, lines };
    size -= step;
  }
  return { fontSize: minSize, lines: split(text, minSize, maxWidth) };
}

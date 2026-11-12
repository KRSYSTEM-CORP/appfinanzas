// Colores dominantes de un logo (data URL) para sugerir paletas en Marca.
// Corre en el navegador: dibuja el logo en un canvas pequeño y agrupa los píxeles.
export async function dominantColors(dataUrl: string, count = 4): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 230) continue; // casi blanco
    if (max < 25) continue; // casi negro
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r;
    cur.g += g;
    cur.b += b;
    cur.n += 1;
    buckets.set(key, cur);
  }
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  const ranked = [...buckets.values()]
    .map((c) => {
      const r = c.r / c.n;
      const g = c.g / c.n;
      const b = c.b / c.n;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      return { r, g, b, score: c.n * (1 + sat / 64) };
    })
    .sort((a, b) => b.score - a.score);

  const picked: { r: number; g: number; b: number }[] = [];
  for (const c of ranked) {
    const far = picked.every((p) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) > 90);
    if (far) picked.push(c);
    if (picked.length >= count) break;
  }
  return picked.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`);
}

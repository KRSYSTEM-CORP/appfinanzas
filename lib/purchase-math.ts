// Matemática pura de compras: reescalado de líneas al total de la factura y costo base.

export type ScaledLine = { subtotalCents: number; baseCents: number; taxCents: number };

// El reescalado debe ser razonable: un factor fuera de 1/3 a 3 casi siempre es una moneda equivocada o un error de dígitos.
export function scaleLooksWrong(scale: number): boolean {
  return !Number.isFinite(scale) || scale > 3 || scale < 1 / 3;
}

// Reescala las líneas al total real de la factura. Tras redondear, el subtotal de la última línea absorbe la
// diferencia hasta `totalCents`, y la base de cada línea queda como subtotal menos IVA, de modo que el IVA por línea
// suma exactamente el IVA total y base + IVA = total.
export function scaleLinesToTotal<T extends ScaledLine>(lines: T[], scale: number, totalCents: number) {
  const scaled = lines.map((l) => ({
    ...l,
    subtotalCents: Math.round(l.subtotalCents * scale),
    taxCents: Math.round(l.taxCents * scale),
  }));
  if (scaled.length) {
    const sum = scaled.reduce((n, l) => n + l.subtotalCents, 0);
    scaled[scaled.length - 1].subtotalCents += totalCents - sum;
  }
  for (const l of scaled) {
    if (l.taxCents > l.subtotalCents) l.taxCents = Math.max(0, l.subtotalCents);
    l.baseCents = l.subtotalCents - l.taxCents;
  }
  const taxTotalCents = scaled.reduce((n, l) => n + l.taxCents, 0);
  const baseTotalCents = scaled.reduce((n, l) => n + l.baseCents, 0);
  return { lines: scaled, taxTotalCents, baseTotalCents };
}

// Costo unitario base (sin IVA) de una línea de compra, en centavos.
export function baseUnitCost(baseCents: number, quantity: number): number {
  return quantity > 0 ? Math.round(baseCents / quantity) : 0;
}

// Moneda declarada en la importación de compras: «Bs»/«VES»/el código local = moneda local; «USD»/«$»/«EUR»/«€»/
// «divisa» o la de referencia = moneda de referencia; vacío = referencia. Cualquier otra cosa se rechaza.
export function resolveImportCurrency(raw: string | undefined, localCode: string, referenceCode: string): "LOCAL" | "REFERENCE" {
  if (raw == null || raw.trim() === "") return "REFERENCE";
  const v = raw.trim().toUpperCase().replace(/\./g, "");
  if (v === "BS" || v === "BSD" || v === "VES" || v === localCode.toUpperCase()) return "LOCAL";
  if (v === "$" || v === "USD" || v === "€" || v === "EUR" || v === "DIVISA" || v === referenceCode.toUpperCase()) return "REFERENCE";
  throw new Error(`Moneda «${raw}» no válida: usa ${[...new Set([`${localCode} (Bs)`, referenceCode, "USD"])].join(", ")}`);
}

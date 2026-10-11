// Matching a scanned code against a catalog. Cameras and hardware scanners
// disagree on small details, so a plain `sku === code` misses real products:
// scanners can append whitespace, a SKU may have been typed in another case,
// and a UPC-A (12 digits) is read by many cameras as an EAN-13 with a leading
// zero (13 digits) — or the other way round.

export function normalizeCode(raw: string): string {
  return raw.replace(/[\r\n\t]/g, "").trim();
}

const isNumeric = (value: string) => /^\d+$/.test(value);
const stripLeadingZeros = (value: string) => value.replace(/^0+/, "");

export function findProductByCode<T extends { sku: string | null }>(products: T[], rawCode: string): T | null {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const lower = code.toLowerCase();
  const exact = products.find((p) => p.sku != null && p.sku.trim().toLowerCase() === lower);
  if (exact) return exact;

  if (isNumeric(code)) {
    const stripped = stripLeadingZeros(code);
    if (stripped) {
      return (
        products.find((p) => {
          const sku = p.sku?.trim();
          return sku != null && isNumeric(sku) && stripLeadingZeros(sku) === stripped;
        }) ?? null
      );
    }
  }
  return null;
}

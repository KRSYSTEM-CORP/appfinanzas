// País del negocio (Ajustes → Negocio) y su código telefónico, para guardar el WhatsApp
// con código de país. Puro, sin React.
export const BUSINESS_COUNTRIES: { name: string; dial: string }[] = [
  { name: "Venezuela", dial: "58" },
  { name: "Colombia", dial: "57" },
  { name: "México", dial: "52" },
  { name: "Estados Unidos", dial: "1" },
];

export function countryLabel(c: { name: string; dial: string }): string {
  return `${c.name} (+${c.dial})`;
}

export function dialCodeFor(country: string | null | undefined): string | null {
  const c = country?.trim().toLowerCase();
  return BUSINESS_COUNTRIES.find((x) => x.name.toLowerCase() === c)?.dial ?? null;
}

// Deja solo dígitos y antepone el código del país cuando el número viene en formato local
// («0412-5550101» → «584125550101»). Si ya trae el código, no lo repite. Sin país conocido
// solo limpia.
export function normalizeWhatsapp(raw: string, country: string | null | undefined): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  const dial = dialCodeFor(country);
  if (!dial) return digits;
  if (digits.startsWith(dial) && digits.length >= dial.length + 9) return digits;
  return dial + digits.replace(/^0+/, "");
}

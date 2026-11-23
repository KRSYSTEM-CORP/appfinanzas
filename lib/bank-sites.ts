// Sitio web oficial de cada banco o servicio del catálogo (lib/payment-accounts.ts), para el botón
// «Ir al banco» de cada cuenta. Solo se guardan direcciones verificadas; si falta alguna (Bicentenario y BOD),
// la cuenta permite escribir la suya. Si un banco cambia de dirección, se corrige aquí.
export const BANK_SITES: Record<string, string> = {
  bdv: "https://www.bancodevenezuela.com",
  banesco: "https://www.banesco.com",
  mercantil: "https://www.mercantilbanco.com",
  provincial: "https://www.provincial.com",
  bancaribe: "https://www.bancaribe.com.ve",
  bancamiga: "https://www.bancamiga.com",
  exterior: "https://www.bancoexterior.com",
  tesoro: "https://www.bt.com.ve",
  vzlacredito: "https://www.venezolano.com",
  bnc: "https://www.bncenlinea.com",
  banplus: "https://www.banplus.com",
  sofitasa: "https://www.sofitasa.com",
  plaza: "https://www.bancoplaza.com",
  activo: "https://www.bancoactivo.com",
  r4: "https://r4conecta.io",
  caroni: "https://www.bancocaroni.com.ve",
  cienbanco: "https://100x100banco.com",
  delsur: "https://www.delsur.com.ve",
  bfc: "https://www.bfc.com.ve",
  bancrecer: "https://www.bancrecer.com.ve",
  zelle: "https://www.zelle.com",
  binance: "https://www.binance.com",
  paypal: "https://www.paypal.com",
};

// Limpia la dirección escrita a mano: solo https, con dominio, sin espacios. Vacío o inválido = null (se usa la del catálogo).
export function normalizeBankSiteUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

// Dirección a abrir para una cuenta: la que escribió el dueño o, si no, la oficial del banco.
export function bankSiteUrl(account: { bankKey: string | null; websiteUrl?: string | null }, defaultKey?: string | null): string | null {
  return normalizeBankSiteUrl(account.websiteUrl) ?? BANK_SITES[account.bankKey ?? defaultKey ?? ""] ?? null;
}

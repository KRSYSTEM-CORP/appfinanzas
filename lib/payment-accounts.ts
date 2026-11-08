// Catálogo de bancos y servicios con logo (public/banks/<clave>.png).
export const BANKS: { key: string; label: string }[] = [
  { key: "bdv", label: "Banco de Venezuela" },
  { key: "banesco", label: "Banesco" },
  { key: "mercantil", label: "Mercantil" },
  { key: "provincial", label: "BBVA Provincial" },
  { key: "bancaribe", label: "Bancaribe" },
  { key: "bancamiga", label: "Bancamiga" },
  { key: "exterior", label: "Banco Exterior" },
  { key: "tesoro", label: "Banco del Tesoro" },
  { key: "bicentenario", label: "Bicentenario" },
  { key: "vzlacredito", label: "Venezolano de Crédito" },
  { key: "bnc", label: "BNC" },
  { key: "banplus", label: "Banplus" },
  { key: "sofitasa", label: "Sofitasa" },
  { key: "plaza", label: "Banco Plaza" },
  { key: "activo", label: "Banco Activo" },
  { key: "r4", label: "R4" },
  { key: "bod", label: "BOD" },
  { key: "caroni", label: "Banco Caroní" },
  { key: "cienbanco", label: "100% Banco" },
  { key: "delsur", label: "Del Sur" },
  { key: "bfc", label: "BFC" },
  { key: "bancrecer", label: "Bancrecer" },
];

export const SERVICES: { key: string; label: string }[] = [
  { key: "zelle", label: "Zelle" },
  { key: "binance", label: "Binance" },
  { key: "paypal", label: "PayPal" },
];

export const ACCOUNT_KIND_LABELS = {
  PAGO_MOVIL: "Pago móvil",
  TRANSFER: "Transferencia",
  ZELLE: "Zelle",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
} as const;

export type AccountKind = keyof typeof ACCOUNT_KIND_LABELS;

// Etiqueta del campo principal según el tipo de cuenta.
export const ACCOUNT_NUMBER_LABELS: Record<AccountKind, string> = {
  PAGO_MOVIL: "Teléfono",
  TRANSFER: "Número de cuenta",
  ZELLE: "Correo de Zelle",
  BINANCE: "Binance ID",
  PAYPAL: "Correo de PayPal",
};

const KNOWN = new Set([...BANKS, ...SERVICES].map((b) => b.key));

export function bankLogoSrc(key: string | null | undefined): string | null {
  return key && KNOWN.has(key) ? `/banks/${key}.png` : null;
}

export function bankLabel(key: string | null | undefined): string | null {
  return [...BANKS, ...SERVICES].find((b) => b.key === key)?.label ?? null;
}

// Para los tipos sin banco (Zelle, Binance, PayPal) el logo es el del servicio.
export function defaultBankKey(kind: AccountKind): string | null {
  return kind === "ZELLE" ? "zelle" : kind === "BINANCE" ? "binance" : kind === "PAYPAL" ? "paypal" : null;
}

// Texto listo para copiar y pegar al cliente.
export function accountClipboardText(a: {
  kind: AccountKind;
  bankName: string | null;
  holder: string | null;
  accountNumber: string;
  docId: string | null;
}): string {
  const lines = [
    `${ACCOUNT_KIND_LABELS[a.kind]}${a.bankName ? ` · ${a.bankName}` : ""}`,
    `${ACCOUNT_NUMBER_LABELS[a.kind]}: ${a.accountNumber}`,
    a.docId ? `Cédula/RIF: ${a.docId}` : null,
    a.holder ? `Titular: ${a.holder}` : null,
  ];
  return lines.filter(Boolean).join("\n");
}

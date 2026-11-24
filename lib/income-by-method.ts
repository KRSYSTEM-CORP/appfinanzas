import type { AccountIncomeRow } from "@/lib/actions/cash-closing";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";

export type IncomeSectionKey = "pos" | "pagomovil" | "transfer" | "zelle" | "binance" | "paypal" | "cash" | "other";

export type IncomeRow = AccountIncomeRow & { label: string };
export type CurrencyTotal = { currencyCode: string; cents: number; refCents: number };
export type IncomeSection = {
  key: IncomeSectionKey;
  title: string;
  rows: IncomeRow[];
  count: number;
  refCents: number;
  byCurrency: CurrencyTotal[];
};

const SECTIONS: { key: IncomeSectionKey; title: string }[] = [
  { key: "pos", title: "Puntos de venta" },
  { key: "pagomovil", title: "Pago móvil" },
  { key: "transfer", title: "Transferencias" },
  { key: "zelle", title: "Zelle" },
  { key: "binance", title: "Binance" },
  { key: "paypal", title: "PayPal" },
  { key: "cash", title: "Efectivo" },
  { key: "other", title: "Otros" },
];

const KIND_SECTION: Record<string, IncomeSectionKey> = {
  PUNTO_DE_VENTA: "pos",
  PAGO_MOVIL: "pagomovil",
  TRANSFER: "transfer",
  ZELLE: "zelle",
  BINANCE: "binance",
  PAYPAL: "paypal",
};

function sectionOf(r: AccountIncomeRow): IncomeSectionKey {
  if (r.accountId != null) return (r.kind && KIND_SECTION[r.kind]) || "other";
  return r.paymentMethod === "CASH" ? "cash" : "other";
}

function addCurrency(list: CurrencyTotal[], r: CurrencyTotal) {
  const t = list.find((c) => c.currencyCode === r.currencyCode);
  if (t) {
    t.cents += r.cents;
    t.refCents += r.refCents;
  } else list.push({ currencyCode: r.currencyCode, cents: r.cents, refCents: r.refCents });
}

// Agrupa lo cobrado por sección (puntos de venta, pago móvil, transferencias,
// Zelle, Binance, PayPal, efectivo y otros). Las filas con cuenta se juntan por
// cuenta + moneda; las sin cuenta, por método + moneda. Las secciones vacías se omiten.
export function groupIncomeByMethod(rows: AccountIncomeRow[]): IncomeSection[] {
  const out = new Map<IncomeSectionKey, IncomeSection>();
  for (const s of SECTIONS) out.set(s.key, { ...s, rows: [], count: 0, refCents: 0, byCurrency: [] });

  for (const r of rows) {
    const sec = out.get(sectionOf(r))!;
    const found = sec.rows.find(
      (x) =>
        x.currencyCode === r.currencyCode &&
        (r.accountId != null ? x.accountId === r.accountId : x.accountId == null && x.paymentMethod === r.paymentMethod)
    );
    if (found) {
      found.count += r.count;
      found.refCents += r.refCents;
      found.cents += r.cents;
    } else {
      sec.rows.push({ ...r, label: r.accountId != null ? r.bankName ?? "" : PAYMENT_METHOD_LABELS[r.paymentMethod] });
    }
    sec.count += r.count;
    sec.refCents += r.refCents;
    addCurrency(sec.byCurrency, r);
  }

  for (const sec of out.values()) {
    sec.rows.sort((a, b) => b.refCents - a.refCents);
    sec.byCurrency.sort((a, b) => b.refCents - a.refCents);
  }
  return SECTIONS.map((s) => out.get(s.key)!).filter((s) => s.rows.length > 0);
}

export function grandTotals(sections: IncomeSection[]): { count: number; refCents: number; byCurrency: CurrencyTotal[] } {
  const byCurrency: CurrencyTotal[] = [];
  let count = 0;
  let refCents = 0;
  for (const s of sections) {
    count += s.count;
    refCents += s.refCents;
    for (const c of s.byCurrency) addCurrency(byCurrency, c);
  }
  byCurrency.sort((a, b) => b.refCents - a.refCents);
  return { count, refCents, byCurrency };
}

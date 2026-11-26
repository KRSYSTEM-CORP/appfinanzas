// Unidades de medida de los productos.
//
// Cada producto guarda su unidad BASE (p. ej. "litro") y el precio es POR esa unidad. Las cantidades
// (existencias, ventas, compras, traspasos) se guardan siempre en la unidad base, con hasta 3 decimales
// (columnas DECIMAL(14,3)). Al vender se puede elegir otra unidad de la MISMA familia (500 ml de un
// producto en litros se guarda como 0,5 L).
//
// Aritmética: todo se calcula en MILÉSIMAS ENTERAS (1 L = 1000) para no arrastrar errores de coma flotante.
// Las columnas llegan de Prisma como Decimal; `toQty` las pasa a number (exacto con 3 decimales).

export type UnitFamily = "conteo" | "volumen" | "masa" | "longitud" | "tiempo" | "otra";

export type UnitDef = {
  /** Clave estable guardada en la base de datos. */
  key: string;
  family: UnitFamily;
  name: string;
  plural: string;
  /** Símbolo corto para mostrar junto a la cantidad ("L", "ml", "kg"). Vacío en las de conteo genéricas. */
  symbol: string;
  /** Admite decimales (litro, kg, m) o solo enteros (unidad, pieza). */
  decimals: boolean;
  /** Cuántas unidades base de la familia equivale 1 de esta (1 ml = 0,001 L). */
  factor: number;
  /** Otros nombres y abreviaturas aceptados al importar (sin tildes, minúsculas). */
  aliases: string[];
};

export const UNIT_FAMILIES: { key: UnitFamily; label: string; base: string }[] = [
  { key: "conteo", label: "Conteo", base: "unidad" },
  { key: "volumen", label: "Volumen", base: "litro" },
  { key: "masa", label: "Peso", base: "kilogramo" },
  { key: "longitud", label: "Longitud", base: "metro" },
  { key: "tiempo", label: "Tiempo", base: "hora" },
  { key: "otra", label: "Otra", base: "otra" },
];

export const UNITS: UnitDef[] = [
  { key: "unidad", family: "conteo", name: "unidad", plural: "unidades", symbol: "", decimals: false, factor: 1, aliases: ["u", "und", "unid", "uds", "un", "unidades", "unit", "units", "c/u", "cu"] },
  { key: "pieza", family: "conteo", name: "pieza", plural: "piezas", symbol: "pza", decimals: false, factor: 1, aliases: ["pza", "pzas", "pz", "piezas", "pieces", "piece"] },
  { key: "par", family: "conteo", name: "par", plural: "pares", symbol: "par", decimals: false, factor: 1, aliases: ["pares", "pair"] },
  { key: "docena", family: "conteo", name: "docena", plural: "docenas", symbol: "doc", decimals: false, factor: 1, aliases: ["doc", "docenas", "dozen"] },
  { key: "caja", family: "conteo", name: "caja", plural: "cajas", symbol: "caja", decimals: false, factor: 1, aliases: ["cajas", "cj", "box"] },
  { key: "paquete", family: "conteo", name: "paquete", plural: "paquetes", symbol: "paq", decimals: false, factor: 1, aliases: ["paq", "paquetes", "pack", "pqte"] },
  { key: "bolsa", family: "conteo", name: "bolsa", plural: "bolsas", symbol: "bolsa", decimals: false, factor: 1, aliases: ["bolsas", "bag"] },
  { key: "botella", family: "conteo", name: "botella", plural: "botellas", symbol: "bot", decimals: false, factor: 1, aliases: ["bot", "botellas", "bottle"] },
  { key: "servicio", family: "conteo", name: "servicio", plural: "servicios", symbol: "serv", decimals: false, factor: 1, aliases: ["serv", "servicios", "service"] },

  { key: "litro", family: "volumen", name: "litro", plural: "litros", symbol: "L", decimals: true, factor: 1, aliases: ["l", "lt", "lts", "litros", "liter", "litre", "ltr"] },
  { key: "mililitro", family: "volumen", name: "mililitro", plural: "mililitros", symbol: "ml", decimals: true, factor: 0.001, aliases: ["ml", "mls", "mililitros", "cc", "cm3"] },
  { key: "galon", family: "volumen", name: "galón", plural: "galones", symbol: "gal", decimals: true, factor: 3.785, aliases: ["gal", "gl", "galon", "galones", "gallon"] },

  { key: "kilogramo", family: "masa", name: "kilogramo", plural: "kilogramos", symbol: "kg", decimals: true, factor: 1, aliases: ["kg", "kgs", "kilo", "kilos", "kilogramos", "kilogram"] },
  { key: "gramo", family: "masa", name: "gramo", plural: "gramos", symbol: "g", decimals: true, factor: 0.001, aliases: ["g", "gr", "grs", "gramos", "gram"] },
  { key: "libra", family: "masa", name: "libra", plural: "libras", symbol: "lb", decimals: true, factor: 0.454, aliases: ["lb", "lbs", "libras", "pound"] },

  { key: "metro", family: "longitud", name: "metro", plural: "metros", symbol: "m", decimals: true, factor: 1, aliases: ["m", "mt", "mts", "metros", "meter", "metre"] },
  { key: "centimetro", family: "longitud", name: "centímetro", plural: "centímetros", symbol: "cm", decimals: true, factor: 0.01, aliases: ["cm", "cms", "centimetro", "centimetros"] },

  { key: "hora", family: "tiempo", name: "hora", plural: "horas", symbol: "h", decimals: true, factor: 1, aliases: ["h", "hr", "hrs", "horas", "hour"] },

  { key: "otra", family: "otra", name: "otra", plural: "otra", symbol: "", decimals: false, factor: 1, aliases: ["otra", "otro", "other"] },
];

export const DEFAULT_UNIT = "unidad";
const BY_KEY = new Map(UNITS.map((u) => [u.key, u]));

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\.$/, "");
}

const BY_ALIAS = new Map<string, UnitDef>();
for (const u of UNITS) {
  BY_ALIAS.set(norm(u.key), u);
  BY_ALIAS.set(norm(u.name), u);
  BY_ALIAS.set(norm(u.plural), u);
  for (const a of u.aliases) BY_ALIAS.set(norm(a), u);
}
// "L" mayúscula y "ml" son distintos de "l"/"m" solo por contexto: se tratan en minúsculas (litro, mililitro).

export function getUnit(key: string | null | undefined): UnitDef {
  return BY_KEY.get(key ?? "") ?? BY_KEY.get(DEFAULT_UNIT)!;
}

export function isUnitKey(key: unknown): key is string {
  return typeof key === "string" && BY_KEY.has(key);
}

/** Familia → unidades. */
export function unitsOfFamily(family: UnitFamily): UnitDef[] {
  return UNITS.filter((u) => u.family === family);
}

/** Unidades en las que se puede VENDER un producto cuya base es `baseKey` (misma familia). */
export function sellableUnits(baseKey: string): UnitDef[] {
  const base = getUnit(baseKey);
  if (base.family === "conteo" || base.family === "otra") return [base];
  return unitsOfFamily(base.family);
}

/** Interpreta un texto libre (nombre, plural o abreviatura en español) y devuelve la clave, o null si no se reconoce. */
export function parseUnit(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = norm(String(raw));
  if (t === "") return null;
  return BY_ALIAS.get(t)?.key ?? null;
}

// ---------------------------------------------------------------------------
// Cantidades en milésimas enteras
// ---------------------------------------------------------------------------

export const QTY_SCALE = 1000;
export const QTY_MAX = 99_999_999; // tope sensato por línea

/** Cualquier valor que venga de Prisma (Decimal), de un formulario o de IndexedDB → number con ≤3 decimales. */
export function toQty(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return toMilli(n) / QTY_SCALE;
}

/** number → milésimas enteras (redondea al milésimo más cercano). */
export function toMilli(q: number): number {
  return Math.round(q * QTY_SCALE + (q >= 0 ? 1e-9 : -1e-9));
}

export function fromMilli(m: number): number {
  return m / QTY_SCALE;
}

export function addQty(a: number, b: number): number {
  return fromMilli(toMilli(a) + toMilli(b));
}

export function subQty(a: number, b: number): number {
  return fromMilli(toMilli(a) - toMilli(b));
}

/** Convierte `qty` expresada en `fromKey` a la unidad `toKey` (misma familia). Redondea al milésimo. */
export function convertQty(qty: number, fromKey: string, toKey: string): number {
  const from = getUnit(fromKey);
  const to = getUnit(toKey);
  if (from.key === to.key) return toQty(qty);
  if (from.family !== to.family) throw new Error("Las unidades no son de la misma familia");
  return fromMilli(Math.round((toMilli(qty) * from.factor) / to.factor));
}

export type QtyCheck = { ok: true; qty: number } | { ok: false; error: string };

/**
 * Valida una cantidad para la unidad base dada: positiva, entera si la unidad no admite decimales,
 * con a lo sumo 3 decimales si los admite.
 */
export function validateQty(raw: unknown, unitKey: string, opts: { allowZero?: boolean } = {}): QtyCheck {
  const unit = getUnit(unitKey);
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, error: "La cantidad no es válida" };
  if (n < 0 || (n === 0 && !opts.allowZero)) return { ok: false, error: "La cantidad debe ser mayor que cero" };
  if (n > QTY_MAX) return { ok: false, error: "La cantidad es demasiado grande" };
  const milli = toMilli(n);
  if (Math.abs(milli - n * QTY_SCALE) > 1e-6) return { ok: false, error: "Usa hasta 3 decimales en la cantidad" };
  if (!unit.decimals && milli % QTY_SCALE !== 0) {
    return { ok: false, error: `Este producto se vende por ${unit.name}: usa cantidades enteras (sin decimales)` };
  }
  if (milli === 0 && !opts.allowZero) return { ok: false, error: "La cantidad debe ser mayor que cero" };
  return { ok: true, qty: fromMilli(milli) };
}

/** precio por unidad base × cantidad, redondeado al céntimo (ambos en milésimas para no perder precisión). */
export function lineTotalCents(unitPriceCents: number, qty: number): number {
  return Math.round((unitPriceCents * toMilli(qty)) / QTY_SCALE);
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

const nf = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 3, minimumFractionDigits: 0 });

/** "0,5", "2", "1.250,75" (separador de miles solo cuando hace falta). */
export function formatQty(q: number | string | null | undefined): string {
  return nf.format(toQty(q));
}

/**
 * Etiqueta de la unidad para una cantidad concreta.
 * Conteo: "1 unidad" / "2 unidades". Medidas con símbolo: "0,5 L". "Otra": usa la etiqueta libre.
 */
export function unitLabel(unitKey: string | null | undefined, qty: number, customLabel?: string | null): string {
  const u = getUnit(unitKey);
  if (u.key === "otra") return (customLabel ?? "").trim() || "u";
  if (u.family === "conteo") return toQty(qty) === 1 ? u.name : u.plural;
  return u.symbol || u.name;
}

/** "0,5 L" · "2 unidades" · "1 coleto"… Texto listo para recibos, carrito, reportes. */
export function formatQtyUnit(qty: number | string | null | undefined, unitKey: string | null | undefined, customLabel?: string | null): string {
  const q = toQty(qty);
  return `${formatQty(q)} ${unitLabel(unitKey, q, customLabel)}`;
}

/** Nombre corto de la unidad base para encabezados y precios ("por litro"). */
export function unitName(unitKey: string | null | undefined, customLabel?: string | null): string {
  const u = getUnit(unitKey);
  if (u.key === "otra") return (customLabel ?? "").trim() || "unidad";
  return u.name;
}

/** Conteo sin símbolo (unidad): para espacios chicos solo se muestra el número. */
export function showsUnitBadge(unitKey: string | null | undefined): boolean {
  return getUnit(unitKey).key !== DEFAULT_UNIT;
}

export const UNIT_LABEL_MAX = 20;

export type UnitInput = { unit?: string | null; unitLabel?: string | null };

/** Normaliza (unit, unitLabel) de un formulario/archivo: clave válida, y etiqueta solo si es «otra». */
export function normalizeUnitInput(i: UnitInput): { ok: true; unit: string; unitLabel: string | null } | { ok: false; error: string } {
  const key = i.unit == null || i.unit === "" ? DEFAULT_UNIT : i.unit;
  if (!isUnitKey(key)) return { ok: false, error: "La unidad de medida no es válida" };
  if (key === "otra") {
    const label = (i.unitLabel ?? "").trim();
    if (!label) return { ok: false, error: "Escribe cómo se llama la unidad (por ejemplo: rollo, saco)" };
    if (label.length > UNIT_LABEL_MAX) return { ok: false, error: `El nombre de la unidad admite hasta ${UNIT_LABEL_MAX} letras` };
    return { ok: true, unit: key, unitLabel: label };
  }
  return { ok: true, unit: key, unitLabel: null };
}

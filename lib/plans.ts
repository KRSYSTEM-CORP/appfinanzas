// Planes de suscripción de KR POS. Los precios son en USD y se pagan en
// bolívares a la tasa dólar BCV del día (ver /billing).
export type PlanId = "EMPRENDE" | "PYME" | "CORPORATIVO";

export type PlanDef = {
  id: PlanId;
  label: string;
  priceUsdCents: number;
  // Solo Emprende: primer mes a este precio para empresas nuevas.
  firstMonthUsdCents?: number;
  maxUsers: number;
  // null = ilimitado.
  maxProducts: number | null;
  aiCredits: number;
  accounting: boolean;
  // Texto de la tarjeta de «Mi plan» (copiado de la preview).
  tagline: string;
  features: string[];
};

export const PLANS: Record<PlanId, PlanDef> = {
  EMPRENDE: {
    id: "EMPRENDE", label: "Emprende", priceUsdCents: 1299, firstMonthUsdCents: 1000,
    maxUsers: 3, maxProducts: 200, aiCredits: 0, accounting: false,
    tagline: "Todo el sistema para empezar",
    features: [
      "Todos los módulos excepto Contabilidad",
      "Sucursales, Learning y Asistente IA (consultar es gratis)",
      "3 usuarios: el dueño o gerente y 2 vendedores",
      "Hasta 200 productos en el inventario",
    ],
  },
  PYME: {
    id: "PYME", label: "Pyme", priceUsdCents: 2399,
    maxUsers: 5, maxProducts: 500, aiCredits: 100, accounting: true,
    tagline: "Más equipo, más inventario y IA",
    features: [
      "Todo lo de Emprende",
      "Módulo de Contabilidad incluido",
      "100 créditos de Asistente IA incluidos",
      "5 usuarios",
      "Hasta 500 productos en el inventario",
    ],
  },
  CORPORATIVO: {
    id: "CORPORATIVO", label: "Corporativo", priceUsdCents: 4499,
    maxUsers: 10, maxProducts: null, aiCredits: 200, accounting: true,
    tagline: "Para equipos grandes y a tu medida",
    features: [
      "Todo lo de Pyme",
      "200 créditos de Asistente IA incluidos",
      "10 usuarios",
      "Productos ilimitados en el inventario",
      "Creación de un módulo personalizado adaptado a tu empresa. Una creación por mes",
    ],
  },
};

export function getPlan(id: string | null | undefined): PlanDef {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : "CORPORATIVO"];
}

// Lo que se cobra ahora: el primer mes de Emprende vale $10 solo si la empresa
// aún no tiene ningún pago aprobado; desde el segundo mes, $12,99.
export function amountDueUsdCents(plan: PlanId, hasApprovedPayment: boolean): number {
  const p = PLANS[plan];
  return !hasApprovedPayment && p.firstMonthUsdCents ? p.firstMonthUsdCents : p.priceUsdCents;
}

export function productLimitMessage(plan: PlanDef): string | null {
  return plan.maxProducts == null
    ? null
    : `Tu plan ${plan.label} permite hasta ${plan.maxProducts} productos. Sube de plan para agregar más.`;
}

// Plan más barato que aún alcanza para lo que la empresa usa hoy (usuarios y productos).
export function recommendPlan(usedUsers: number, usedProducts: number): PlanDef {
  const list = Object.values(PLANS);
  return (
    list.find((p) => p.maxUsers >= usedUsers && (p.maxProducts == null || p.maxProducts >= usedProducts)) ??
    list[list.length - 1]
  );
}

// Monto a cobrar por el plan elegido. Si es el plan actual con tarifa personalizada
// del administrador, se respeta esa tarifa; si no, precio de lista (con el primer mes de Emprende).
export function planAmountDueUsdCents(opts: {
  selected: PlanId;
  current: PlanId;
  monthlyFeeUsdCents: number | null;
  hasApprovedPayment: boolean;
}): number {
  const { selected, current, monthlyFeeUsdCents, hasApprovedPayment } = opts;
  if (selected === current && monthlyFeeUsdCents != null && monthlyFeeUsdCents !== PLANS[selected].priceUsdCents) {
    return monthlyFeeUsdCents;
  }
  return amountDueUsdCents(selected, hasApprovedPayment);
}

// El plan solicitado viaja en la nota del reporte de pago (sin migraciones): el
// administrador lo ve al revisar y, al aprobar, se aplica.
const PLAN_NOTE_RE = /^Plan solicitado: (EMPRENDE|PYME|CORPORATIVO)\./;
export function planRequestNote(plan: PlanId, extra?: string): string {
  return `Plan solicitado: ${plan}.${extra?.trim() ? ` ${extra.trim()}` : ""}`;
}
export function parsePlanRequest(note: string | null | undefined): PlanId | null {
  const m = note ? PLAN_NOTE_RE.exec(note) : null;
  return m ? (m[1] as PlanId) : null;
}

export function userLimitMessage(plan: PlanDef): string {
  return `Tu plan ${plan.label} permite hasta ${plan.maxUsers} usuarios. Sube de plan para agregar más.`;
}

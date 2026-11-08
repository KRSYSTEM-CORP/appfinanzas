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
};

export const PLANS: Record<PlanId, PlanDef> = {
  EMPRENDE: {
    id: "EMPRENDE", label: "Emprende", priceUsdCents: 1299, firstMonthUsdCents: 1000,
    maxUsers: 3, maxProducts: 200, aiCredits: 0, accounting: false,
  },
  PYME: {
    id: "PYME", label: "Pyme", priceUsdCents: 2399,
    maxUsers: 5, maxProducts: 500, aiCredits: 100, accounting: true,
  },
  CORPORATIVO: {
    id: "CORPORATIVO", label: "Corporativo", priceUsdCents: 4499,
    maxUsers: 10, maxProducts: null, aiCredits: 200, accounting: true,
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

export function userLimitMessage(plan: PlanDef): string {
  return `Tu plan ${plan.label} permite hasta ${plan.maxUsers} usuarios. Sube de plan para agregar más.`;
}

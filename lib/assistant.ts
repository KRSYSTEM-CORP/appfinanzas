import { z } from "zod";
import { PLANS, type PlanId } from "@/lib/plans";

// Consultar es gratis (con tope diario para cuidar el costo); aplicar una
// propuesta cuesta créditos, solo si el usuario confirma.
export const AI_APPLY_COST = 5;

export function dailyAskCap(plan: PlanId): number {
  return plan === "EMPRENDE" ? 15 : plan === "PYME" ? 50 : 100;
}

export type CreditsState = {
  plan: PlanId;
  // Créditos del plan usados en el periodo (mes) actual.
  usedThisPeriod: number;
  // Créditos comprados u otorgados; no vencen.
  extra: number;
};

export function creditsRemaining(s: CreditsState): { fromPlan: number; extra: number; total: number } {
  const fromPlan = Math.max(0, PLANS[s.plan].aiCredits - s.usedThisPeriod);
  return { fromPlan, extra: s.extra, total: fromPlan + s.extra };
}

// Gasta primero los créditos del plan y luego los extra. null si no alcanzan.
export function spendCredits(s: CreditsState, cost: number): { planUsed: number; extraUsed: number } | null {
  const left = creditsRemaining(s);
  if (cost <= 0 || left.total < cost) return null;
  const planUsed = Math.min(left.fromPlan, cost);
  return { planUsed, extraUsed: cost - planUsed };
}

// "2026-11" — el consumo del plan se reinicia cada mes.
export function periodKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const ProposalSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("EXPENSE"),
    description: z.string().trim().min(2).max(120),
    category: z.string().trim().max(60).optional(),
    // En la divisa referencial de la empresa.
    amount: z.number().positive().max(1_000_000),
  }),
  z.object({
    type: z.literal("PRICE_ADJUST"),
    category: z.string().trim().min(1).max(60),
    // Entre -50 % y +50 %, distinto de cero.
    percent: z.number().min(-50).max(50).refine((n) => n !== 0, "El ajuste no puede ser 0"),
  }),
]);
export type Proposal = z.infer<typeof ProposalSchema>;

export type AssistantReply = { answer: string; proposal: Proposal | null };

// Lee la respuesta del modelo: JSON {answer, proposal?}. Si no es JSON válido,
// se usa el texto tal cual como respuesta y sin propuesta. Una propuesta que no
// pasa la validación se descarta (el modelo nunca ejecuta nada por sí solo).
export function parseAssistantReply(raw: string): AssistantReply {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as { answer?: unknown; proposal?: unknown };
      const answer = typeof obj.answer === "string" ? obj.answer.trim().slice(0, 1500) : "";
      const parsed = obj.proposal ? ProposalSchema.safeParse(obj.proposal) : null;
      if (answer) return { answer, proposal: parsed?.success ? parsed.data : null };
    } catch {
      // cae al texto plano
    }
  }
  return { answer: text.slice(0, 1500) || "No pude generar una respuesta. Intenta de nuevo.", proposal: null };
}

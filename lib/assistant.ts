import { z } from "zod";
import { PLANS, type PlanId } from "@/lib/plans";
import { ASSISTANT_LINKS, DATASETS } from "@/lib/assistant-types";

// Cada consulta cuesta créditos (sin tope diario): 1 por una consulta normal y 5 cuando la respuesta
// es un documento o una consulta grande (tabla/PDF, varios bloques o una acción propuesta).
export const AI_ASK_COST = 1;
export const AI_BIG_COST = 5;
// Compatibilidad: ya no se cobra al aplicar; la acción va incluida en el costo de la consulta.
export const AI_APPLY_COST = 0;

// Límites de contexto: lo que el asistente recibe en cada consulta.
export const MAX_QUESTION_CHARS = 500;
export const MAX_HISTORY_TURNS = 3;
export const MAX_CONVERSATION_MESSAGES = 30;

// Paquetes de créditos extra (no vencen). Precio en dólares.
export const AI_PACKS = [
  { credits: 50, priceCents: 500 },
  { credits: 100, priceCents: 900 },
  { credits: 250, priceCents: 2000 },
  { credits: 500, priceCents: 3500 },
  { credits: 1000, priceCents: 6000 },
] as const;

export function findPack(credits: number) {
  return AI_PACKS.find((p) => p.credits === credits) ?? null;
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
    type: z.literal("SALE"),
    // Productos del catálogo (ids reales que vienen en <catalogo>) y cantidades.
    items: z.array(z.object({ productId: z.string().min(1).max(60), quantity: z.number().int().min(1).max(10_000) })).min(1).max(30),
    // Cliente existente (por teléfono) o ninguno = «Cliente general».
    customerPhone: z.string().trim().max(40).optional(),
    paymentStatus: z.enum(["PAID", "CREDIT"]).default("PAID"),
    paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL", "POS", "OTHER"]).default("CASH"),
    reference: z.string().trim().max(60).optional(),
    discountPercent: z.number().min(0).max(100).default(0),
    note: z.string().trim().max(200).optional(),
  }),
  z.object({
    type: z.literal("PRICE_ADJUST"),
    category: z.string().trim().min(1).max(60),
    // Entre -50 % y +50 %, distinto de cero.
    percent: z.number().min(-50).max(50).refine((n) => n !== 0, "El ajuste no puede ser 0"),
  }),
]);
export type Proposal = z.infer<typeof ProposalSchema>;

// Lo que el modelo pide mostrar (el servidor lo convierte en datos reales).
export const BlockSpecSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("table"),
    dataset: z.enum(DATASETS),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    type: z.literal("chart"),
    dataset: z.enum(["ventas_por_dia", "gastos_por_categoria", "top_productos"]),
    kind: z.enum(["bar", "line"]).default("bar"),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({ type: z.literal("products"), query: z.string().trim().min(1).max(60) }),
  z.object({ type: z.literal("link"), to: z.enum(Object.keys(ASSISTANT_LINKS) as [string, ...string[]]) }),
]);
export type BlockSpec = z.infer<typeof BlockSpecSchema>;

export type AssistantReply = { answer: string; proposal: Proposal | null; blocks: BlockSpec[] };

// Costo de una respuesta: grande si trae una tabla (documento/PDF), varios bloques o una acción propuesta.
export function consultCost(reply: AssistantReply): number {
  const big = reply.proposal != null || reply.blocks.length >= 2 || reply.blocks.some((b) => b.type === "table");
  return big ? AI_BIG_COST : AI_ASK_COST;
}

// Lee la respuesta del modelo: JSON {answer, proposal?}. Si no es JSON válido,
// se usa el texto tal cual como respuesta y sin propuesta. Una propuesta que no
// pasa la validación se descarta (el modelo nunca ejecuta nada por sí solo).
export function parseAssistantReply(raw: string): AssistantReply {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1)) as { answer?: unknown; proposal?: unknown; blocks?: unknown };
      const answer = typeof obj.answer === "string" ? obj.answer.trim().slice(0, 2500) : "";
      const parsed = obj.proposal ? ProposalSchema.safeParse(obj.proposal) : null;
      // Cada bloque se valida por separado: uno inválido se descarta sin perder los demás.
      const blocks: BlockSpec[] = [];
      if (Array.isArray(obj.blocks)) {
        for (const b of obj.blocks.slice(0, 12)) {
          const r = BlockSpecSchema.safeParse(b);
          if (r.success) blocks.push(r.data);
          if (blocks.length >= 4) break;
        }
      }
      if (answer) return { answer, proposal: parsed?.success ? parsed.data : null, blocks };
    } catch {
      // cae al texto plano
    }
  }
  return { answer: text.slice(0, 1500) || "No pude generar una respuesta. Intenta de nuevo.", proposal: null, blocks: [] };
}

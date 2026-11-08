import { describe, expect, it } from "vitest";
import { creditsRemaining, dailyAskCap, parseAssistantReply, periodKey, spendCredits } from "@/lib/assistant";

describe("créditos del asistente", () => {
  it("cuenta primero los del plan y luego los extra", () => {
    const s = { plan: "PYME" as const, usedThisPeriod: 98, extra: 10 };
    expect(creditsRemaining(s)).toEqual({ fromPlan: 2, extra: 10, total: 12 });
    expect(spendCredits(s, 5)).toEqual({ planUsed: 2, extraUsed: 3 });
  });
  it("no deja gastar sin saldo", () => {
    expect(spendCredits({ plan: "EMPRENDE", usedThisPeriod: 0, extra: 3 }, 5)).toBeNull();
    expect(creditsRemaining({ plan: "EMPRENDE", usedThisPeriod: 0, extra: 0 }).total).toBe(0);
  });
  it("tiene topes diarios por plan y periodo mensual", () => {
    expect(dailyAskCap("EMPRENDE")).toBeLessThan(dailyAskCap("CORPORATIVO"));
    expect(periodKey(new Date(2026, 10, 9))).toBe("2026-11");
  });
});

describe("respuesta del modelo", () => {
  it("lee la respuesta y una propuesta válida", () => {
    const r = parseAssistantReply('{"answer":"Vendiste 120.","proposal":{"type":"EXPENSE","description":"Alquiler","amount":300}}');
    expect(r.answer).toBe("Vendiste 120.");
    expect(r.proposal).toEqual({ type: "EXPENSE", description: "Alquiler", amount: 300 });
  });
  it("tolera texto alrededor del JSON", () => {
    expect(parseAssistantReply('Claro: {"answer":"Hola"} listo').answer).toBe("Hola");
  });
  it("descarta propuestas fuera de límites o inventadas", () => {
    expect(parseAssistantReply('{"answer":"ok","proposal":{"type":"PRICE_ADJUST","category":"Ropa","percent":90}}').proposal).toBeNull();
    expect(parseAssistantReply('{"answer":"ok","proposal":{"type":"PRICE_ADJUST","category":"Ropa","percent":0}}').proposal).toBeNull();
    expect(parseAssistantReply('{"answer":"ok","proposal":{"type":"BORRAR_TODO"}}').proposal).toBeNull();
  });
  it("si no es JSON usa el texto", () => {
    const r = parseAssistantReply("Respuesta simple");
    expect(r).toEqual({ answer: "Respuesta simple", proposal: null });
  });
});

import { describe, expect, it } from "vitest";
import { AI_ASK_COST, AI_BIG_COST, MAX_HISTORY_TURNS, MAX_QUESTION_CHARS, consultCost, parseAssistantReply } from "@/lib/assistant";

describe("costo por consulta", () => {
  it("1 crédito por una consulta normal", () => {
    expect(consultCost({ answer: "Vendiste 100", proposal: null, blocks: [] })).toBe(AI_ASK_COST);
    expect(consultCost({ answer: "Mira", proposal: null, blocks: [{ type: "chart", dataset: "ventas_por_dia", kind: "bar" }] })).toBe(AI_ASK_COST);
  });
  it("5 créditos por un documento (tabla/PDF), varios bloques o una acción propuesta", () => {
    expect(consultCost({ answer: "x", proposal: null, blocks: [{ type: "table", dataset: "inventario" }] })).toBe(AI_BIG_COST);
    expect(consultCost({ answer: "x", proposal: null, blocks: [{ type: "products", query: "a" }, { type: "link", to: "pos" }] })).toBe(AI_BIG_COST);
    expect(consultCost({ answer: "x", proposal: { type: "EXPENSE", description: "Luz", amount: 10 }, blocks: [] })).toBe(AI_BIG_COST);
  });
  it("no hay tope diario de consultas y el contexto está acotado", () => {
    expect(MAX_QUESTION_CHARS).toBe(500);
    expect(MAX_HISTORY_TURNS).toBe(3);
  });
});

describe("parseAssistantReply con bloques y ventas", () => {
  it("lee los bloques válidos y descarta los inválidos", () => {
    const r = parseAssistantReply(
      JSON.stringify({
        answer: "Aquí tienes",
        blocks: [
          { type: "table", dataset: "stock_bajo" },
          { type: "chart", dataset: "ventas_por_dia", kind: "line", from: "2026-11-01", to: "2026-11-14" },
          { type: "table", dataset: "no_existe" },
          { type: "link", to: "rutas_inventadas" },
          { type: "products", query: "camisa" },
        ],
        proposal: null,
      })
    );
    expect(r.blocks.map((b) => b.type)).toEqual(["table", "chart", "products"]);
  });

  it("acepta una propuesta de venta válida y rechaza una sin productos", () => {
    const ok = parseAssistantReply(
      JSON.stringify({ answer: "Listo", proposal: { type: "SALE", items: [{ productId: "p1", quantity: 2 }], paymentStatus: "PAID", paymentMethod: "CASH" } })
    );
    expect(ok.proposal?.type).toBe("SALE");
    const bad = parseAssistantReply(JSON.stringify({ answer: "Listo", proposal: { type: "SALE", items: [], paymentStatus: "PAID" } }));
    expect(bad.proposal).toBeNull();
  });

  it("limita a 4 bloques", () => {
    const blocks = Array.from({ length: 8 }, () => ({ type: "table", dataset: "inventario" }));
    expect(parseAssistantReply(JSON.stringify({ answer: "x", blocks })).blocks).toHaveLength(4);
  });

  it("texto plano: sin bloques ni propuesta", () => {
    const r = parseAssistantReply("Hola, sin JSON");
    expect(r.blocks).toEqual([]);
    expect(r.proposal).toBeNull();
  });
});

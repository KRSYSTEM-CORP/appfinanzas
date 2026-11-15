import { describe, expect, it } from "vitest";
import { DAILY_ASK_CAP, dailyAskCap, parseAssistantReply } from "@/lib/assistant";

describe("tope diario", () => {
  it("es de 20 consultas para todos los planes", () => {
    expect(DAILY_ASK_CAP).toBe(20);
    expect(dailyAskCap("EMPRENDE")).toBe(20);
    expect(dailyAskCap("CORPORATIVO")).toBe(20);
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

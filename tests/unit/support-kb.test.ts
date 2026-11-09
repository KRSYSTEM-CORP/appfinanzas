import { describe, expect, it } from "vitest";
import { supportKnowledge } from "@/lib/support-kb";
import { PLANS } from "@/lib/plans";

describe("manual de soporte del asistente", () => {
  const kb = supportKnowledge();
  it("menciona cada plan con su precio actual", () => {
    for (const p of Object.values(PLANS)) {
      expect(kb).toContain(p.label);
      expect(kb).toContain(`$${(p.priceUsdCents / 100).toFixed(2).replace(".", ",")}`);
    }
  });
  it("aclara que Contabilidad es solo de Pyme y Corporativo", () => {
    expect(kb).toMatch(/Contabilidad: solo en los planes Pyme y Corporativo/);
  });
  it("no se pasa de tamaño (va en cada consulta)", () => {
    expect(kb.length).toBeLessThan(6000);
  });
});

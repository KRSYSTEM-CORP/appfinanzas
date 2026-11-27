import { describe, expect, it } from "vitest";
import { lineForMethod, type OutflowLine } from "@/lib/cash-outflow";
import { accountsForMethod, defaultAccountFor } from "@/lib/payment-method-accounts";

const accounts = [
  { id: "pm1", kind: "PAGO_MOVIL", balanceCents: 100 },
  { id: "z1", kind: "ZELLE", balanceCents: 500 },
  { id: "z2", kind: "ZELLE", balanceCents: 900 },
];
const base: OutflowLine = { method: "CASH", accountId: "", currency: "LOCAL", amount: "12" };

describe("elegir método en una salida", () => {
  it("cada método queda elegido (no vuelve a Efectivo) y conserva el monto", () => {
    for (const m of ["CARD", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL", "POS", "OTHER"] as const) {
      const line = lineForMethod(base, m, defaultAccountFor(m, accounts), true);
      expect(line.method).toBe(m);
      expect(line.amount).toBe("12");
    }
  });
  it("preselecciona la cuenta de mayor saldo y pasa a divisa en Zelle", () => {
    const line = lineForMethod(base, "ZELLE", defaultAccountFor("ZELLE", accounts), true);
    expect(line.accountId).toBe("z2");
    expect(line.currency).toBe("REFERENCE");
    expect(accountsForMethod("ZELLE", accounts)).toHaveLength(2);
  });
  it("pago móvil usa bolívares", () => {
    expect(lineForMethod(base, "CARD", "pm1", true).currency).toBe("LOCAL");
  });
});

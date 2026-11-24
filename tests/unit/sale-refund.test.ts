import { describe, expect, it } from "vitest";
import { cashRefundCents, refundConcept } from "@/lib/sale-refund";
import { FISCAL_NOTES_ENABLED } from "@/lib/fiscal-notes";

describe("devolución por anulación", () => {
  it("suma solo el efectivo (pago inicial y abonos)", () => {
    expect(
      cashRefundCents([
        { paymentMethod: "CASH", amountEurCents: 500 },
        { paymentMethod: "ZELLE", amountEurCents: 900 },
        { paymentMethod: "CASH", amountEurCents: 250 },
      ])
    ).toBe(750);
  });
  it("sin efectivo no hay devolución", () => {
    expect(cashRefundCents([{ paymentMethod: "CARD", amountEurCents: 100 }])).toBe(0);
    expect(cashRefundCents([])).toBe(0);
  });
  it("concepto claro con el número de venta", () => {
    expect(refundConcept(42)).toBe("Devolución por anulación de venta N.º 42");
  });
  it("las notas fiscales están en Próximamente", () => {
    expect(FISCAL_NOTES_ENABLED).toBe(false);
  });
});

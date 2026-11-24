import { describe, expect, it } from "vitest";
import { paymentSettlesPurchase, purchaseRemaining } from "@/lib/purchase-payment";

describe("purchase-payment", () => {
  it("saldo descuenta retención y abonos", () => {
    expect(purchaseRemaining(10000, 1000, 4000)).toBe(5000);
  });
  it("liquida con monto exacto o mayor, no con menor", () => {
    expect(paymentSettlesPurchase(5000, 5000)).toBe(true);
    expect(paymentSettlesPurchase(5001, 5000)).toBe(true);
    expect(paymentSettlesPurchase(4999, 5000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { computeIgtfCents } from "@/lib/igtf";

describe("computeIgtfCents", () => {
  it("cobra el 3% solo sobre lo pagado en divisas", () => {
    const payments = [
      { currencyCode: "USD", amountEurCents: 10000 },
      { currencyCode: "VES", amountEurCents: 5000 },
    ];
    expect(computeIgtfCents(payments, "VES", 3)).toBe(300);
  });
  it("es 0 si todo se pagó en bolívares", () => {
    expect(computeIgtfCents([{ currencyCode: "VES", amountEurCents: 9999 }], "VES", 3)).toBe(0);
  });
});

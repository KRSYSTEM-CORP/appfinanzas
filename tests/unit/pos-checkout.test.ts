import { describe, expect, it } from "vitest";
import {
  buildLine,
  changeDue,
  discountPercentFromAmount,
  formatAmount,
  igtfCents,
  parseAmount,
  paySummary,
  toPaymentRows,
  visibleMethods,
  type CurrencyCtx,
} from "@/lib/pos/checkout";

const ctx: CurrencyCtx = { currencyCode: "VES", rate: 897.54, exchangeRateEnabled: true, referenceCurrency: "USD" };

describe("parseAmount / formatAmount", () => {
  it("lee el formato de la pantalla y el decimal con punto", () => {
    expect(parseAmount("53.852,30")).toBe(53852.3);
    expect(parseAmount("53852,30")).toBe(53852.3);
    expect(parseAmount("60.5")).toBe(60.5);
    expect(parseAmount("1.234.567")).toBe(1234567);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });
  it("muestra con separador de miles y coma decimal", () => {
    expect(formatAmount(53852.3)).toBe("53.852,30");
  });
});

describe("buildLine", () => {
  it("sin monto escrito cobra lo que falta en la moneda del método", () => {
    const l = buildLine("pm", "", "123456", 6000, ctx)!;
    expect(l.amount).toBeCloseTo(53852.4, 2);
    expect(l.refCents).toBe(6000);
    expect(l.reference).toBe("123456");
  });
  it("nunca cubre más de lo que falta", () => {
    const l = buildLine("ed", "100", "", 6000, ctx)!;
    expect(l.refCents).toBe(6000);
    expect(l.amount).toBe(60);
  });
  it("un pago parcial en dólares", () => {
    expect(buildLine("zl", "20", "", 6000, ctx)!.refCents).toBe(2000);
  });
  it("monto cero no crea pago", () => {
    expect(buildLine("ed", "0", "", 6000, ctx)).toBeNull();
  });
});

describe("paySummary", () => {
  it("en modo completo con un método elegido queda saldado", () => {
    expect(paySummary("full", "pm", [], 6000)).toEqual({ paidCents: 6000, remainingCents: 6000, saldoCents: 0, done: true });
  });
  it("sin método elegido falta todo", () => {
    expect(paySummary("full", null, [], 6000).saldoCents).toBe(6000);
  });
  it("fraccionado: suma los pagos agregados", () => {
    const lines = [{ id: "ed" as const, amount: 20, refCents: 2000, reference: "" }];
    const s = paySummary("split", "pm", lines, 6000);
    expect(s.saldoCents).toBe(4000);
    expect(s.done).toBe(false);
    expect(paySummary("split", null, [...lines, { id: "zl", amount: 40, refCents: 4000, reference: "" }], 6000).done).toBe(true);
  });
});

describe("igtfCents", () => {
  it("3 % sobre el total si el método completo es en divisas", () => {
    expect(igtfCents("full", "ed", [], 6000, 3, ctx)).toBe(180);
    expect(igtfCents("full", "pm", [], 6000, 3, ctx)).toBe(0);
  });
  it("fraccionado: solo sobre los pagos en divisas", () => {
    const lines = [
      { id: "ed" as const, amount: 20, refCents: 2000, reference: "" },
      { id: "pm" as const, amount: 35901.6, refCents: 4000, reference: "" },
    ];
    expect(igtfCents("split", null, lines, 6000, 3, ctx)).toBe(60);
  });
  it("no aplica a crédito ni si la empresa no es agente", () => {
    expect(igtfCents("debt", "ed", [], 6000, 3, ctx)).toBe(0);
    expect(igtfCents("full", "ed", [], 6000, null, ctx)).toBe(0);
  });
});

describe("toPaymentRows", () => {
  it("convierte a las filas que valida el servidor", () => {
    expect(toPaymentRows([{ id: "ed", amount: 60, refCents: 6000, reference: "" }])).toEqual([
      { paymentMethod: "CASH", amount: "60.00", paidInForeignCurrency: true, reference: "" },
    ]);
    expect(toPaymentRows([{ id: "pm", amount: 53852.4, refCents: 6000, reference: "1" }])[0]).toMatchObject({
      paymentMethod: "CARD",
      amount: "53852.40",
      paidInForeignCurrency: false,
    });
  });
});

describe("otros", () => {
  it("vuelto y faltante", () => {
    expect(changeDue(54, 100)).toBe(46);
    expect(changeDue(54, 50)).toBe(-4);
  });
  it("descuento en monto a porcentaje", () => {
    expect(discountPercentFromAmount(600, 6000)).toBe(10);
    expect(discountPercentFromAmount(9000, 6000)).toBe(100);
    expect(discountPercentFromAmount(0, 6000)).toBe(0);
  });
  it("sin tasa de cambio hay un solo efectivo", () => {
    const ids = visibleMethods(false).map((m) => m.id);
    expect(ids).not.toContain("ebs");
    expect(visibleMethods(false).find((m) => m.id === "ed")?.label).toBe("Efectivo");
  });
});

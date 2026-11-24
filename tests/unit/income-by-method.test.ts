import { describe, expect, it } from "vitest";
import { groupIncomeByMethod, grandTotals } from "@/lib/income-by-method";
import type { AccountIncomeRow } from "@/lib/actions/cash-closing";

const base: AccountIncomeRow = {
  accountId: null, kind: null, bankKey: null, bankName: null, accountNumber: null,
  paymentMethod: "CASH", count: 1, refCents: 100, currencyCode: "USD", cents: 100,
};
const r = (o: Partial<AccountIncomeRow>): AccountIncomeRow => ({ ...base, ...o });

describe("groupIncomeByMethod", () => {
  it("devuelve vacío sin cobros", () => {
    expect(groupIncomeByMethod([])).toEqual([]);
  });

  it("ordena las secciones y separa cuentas de métodos sin cuenta", () => {
    const s = groupIncomeByMethod([
      r({ paymentMethod: "OTHER" }),
      r({ paymentMethod: "CASH" }),
      r({ accountId: "z", kind: "ZELLE", paymentMethod: "ZELLE" }),
      r({ accountId: "p", kind: "PAGO_MOVIL", paymentMethod: "CARD", currencyCode: "VES", cents: 4000, refCents: 100 }),
      r({ accountId: "t1", kind: "PUNTO_DE_VENTA", paymentMethod: "POS", bankName: "Banesco" }),
      r({ accountId: "t2", kind: "PUNTO_DE_VENTA", paymentMethod: "POS", bankName: "Mercantil", refCents: 500, cents: 500 }),
    ]);
    expect(s.map((x) => x.key)).toEqual(["pos", "pagomovil", "zelle", "cash", "other"]);
    expect(s[0].rows.map((x) => x.accountId)).toEqual(["t2", "t1"]);
    expect(s[0].refCents).toBe(600);
  });

  it("junta por cuenta y moneda y totaliza por moneda", () => {
    const s = groupIncomeByMethod([
      r({ accountId: "p", kind: "PAGO_MOVIL", paymentMethod: "CARD", currencyCode: "VES", cents: 1000, refCents: 30, count: 2 }),
      r({ accountId: "p", kind: "PAGO_MOVIL", paymentMethod: "CARD", currencyCode: "VES", cents: 500, refCents: 15, count: 1 }),
    ]);
    expect(s[0].rows).toHaveLength(1);
    expect(s[0].rows[0]).toMatchObject({ count: 3, cents: 1500, refCents: 45 });
    expect(s[0].byCurrency).toEqual([{ currencyCode: "VES", cents: 1500, refCents: 45 }]);
  });

  it("sin cuenta agrupa por método y kind desconocido va a Otros", () => {
    const s = groupIncomeByMethod([
      r({ paymentMethod: "CARD" }),
      r({ paymentMethod: "ZELLE" }),
      r({ accountId: "x", kind: "RARO", paymentMethod: "OTHER" }),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].key).toBe("other");
    expect(s[0].rows).toHaveLength(3);
  });

  it("grandTotals suma secciones", () => {
    const s = groupIncomeByMethod([r({}), r({ accountId: "z", kind: "ZELLE", paymentMethod: "ZELLE", refCents: 250, cents: 250 })]);
    expect(grandTotals(s)).toEqual({ count: 2, refCents: 350, byCurrency: [{ currencyCode: "USD", cents: 350, refCents: 350 }] });
  });
});

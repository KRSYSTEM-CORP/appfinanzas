import { describe, expect, it } from "vitest";
import { incomeStatement, ivaPosition, purchasesCost } from "@/lib/statements-math";
import { adminGroup, statementTab } from "@/lib/admin-nav";

const sale = { baseImponibleCents: 10000, taxCents: 1600 };
const purchase = { baseImponibleCents: 5000, taxCents: 800, totalCents: 5800 };

describe("estado de resultados", () => {
  it("usa ventas netas sin IVA como ingreso", () => {
    const r = incomeStatement({ netSales: 10000, cogs: 4000, commissions: 500, expenses: 500, islrRate: 0.15 });
    expect(r).toEqual({ income: 10000, gross: 6000, operating: 5000, islr: 750, net: 4250 });
  });
  it("sin utilidad no hay ISLR", () => {
    expect(incomeStatement({ netSales: 100, cogs: 200, commissions: 0, expenses: 0, islrRate: 0.15 }).islr).toBe(0);
  });
});

describe("IVA", () => {
  it("con IVA calcula débito, crédito y saldo", () => {
    const r = ivaPosition(true, [sale], [], [], [purchase]);
    expect(r).toMatchObject({ debit: 1600, credit: 800, balance: 800, payable: 800 });
  });
  it("sin IVA todo es cero", () => {
    expect(ivaPosition(false, [sale], [], [], [purchase])).toEqual({ debit: 0, credit: 0, balance: 0, payable: 0, salesBase: 0, purchasesBase: 0 });
  });
  it("compras sin IVA cuando la empresa lo usa", () => {
    expect(purchasesCost(true, [purchase])).toBe(5000);
    expect(purchasesCost(false, [purchase])).toBe(5800);
  });
  it("navegación oculta la pestaña de IVA", () => {
    expect(adminGroup("conta", false).subs.some((s) => s.id === "iva")).toBe(false);
    expect(adminGroup("conta").subs.some((s) => s.id === "iva")).toBe(true);
    expect(statementTab("iva", false)).toBe("mov");
  });
});

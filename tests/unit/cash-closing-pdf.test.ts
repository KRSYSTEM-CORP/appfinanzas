import { describe, expect, it } from "vitest";
import { buildCashClosingPDF } from "@/lib/cash-closing-pdf";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";

const company = { name: "Comercial Pruebas" } as never;

function summary(byAccount: CashClosingSummary["byAccount"]): CashClosingSummary {
  return {
    date: "2026-11-23", shiftNumber: 1, responsibleName: "Ana", openedAt: null, shiftOpen: false, shifts: [],
    openingCents: 0, cashSalesCents: 0, outflows: [], outflowsCents: 0, cashOutflowsCents: 0, refundedCash: [], expectedCashCents: 0, openingRefCents: null, openingLocalCents: null, counted: null, voidedCount: 0, voidedCents: 0, totalCents: 1000, salesCount: 1,
    paidCents: 1000, paidCount: 1, creditCents: 0, creditCount: 0, byMethod: [], byCurrency: [], byAccount, closed: null,
  };
}

describe("Corte Z en PDF", () => {
  it("incluye la tabla «Ingresos por método y cuenta» cuando hay cobros por cuenta", async () => {
    const doc = await buildCashClosingPDF(
      summary([
        { accountId: "a1", kind: "PUNTO_DE_VENTA", bankKey: "bnc", bankName: "BNC", accountNumber: "T-001", paymentMethod: "POS", count: 3, refCents: 900, currencyCode: "VES", cents: 90_000 },
        { accountId: null, kind: null, bankKey: null, bankName: null, accountNumber: null, paymentMethod: "CASH", count: 1, refCents: 100, currencyCode: "USD", cents: 100 },
      ]),
      company, "Sucursal Principal", 100
    );
    const text = (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join(" ");
    expect(text).toContain("Ingresos por método y cuenta");
    expect(text).toContain("Puntos de venta");
    expect(text).toContain("BNC");
  });
  it("sin cobros no agrega la tabla", async () => {
    const doc = await buildCashClosingPDF(summary([]), company, null, 100);
    const text = (doc as unknown as { internal: { pages: string[][] } }).internal.pages.flat().join(" ");
    expect(text).not.toContain("Ingresos por método y cuenta");
  });
});

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintableCashClosing } from "@/components/print/PrintableCashClosing";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";

const base: CashClosingSummary = {
  date: "2026-11-24",
  shiftNumber: 1,
  responsibleName: "Gabriela",
  openedAt: null,
  shiftOpen: false,
  shifts: [],
  openingCents: 1000,
  cashSalesCents: 4000,
  outflows: [
    { id: "o1", concept: "Devolución por anulación de venta N.º 5", amountCents: 1000, createdAt: new Date("2026-11-24T18:00:00Z"), paymentMethod: "CASH", accountLabel: null, currencyCode: "USD", amountCurrencyCents: 1000, exchangeRate: 40, saleId: "s5" },
    { id: "o2", concept: "Devolución por anulación de venta N.º 6", amountCents: 500, createdAt: new Date("2026-11-24T18:05:00Z"), paymentMethod: "CARD", accountLabel: "Banesco · 0414", currencyCode: "VES", amountCurrencyCents: 20000, exchangeRate: 40, saleId: "s6" },
  ],
  outflowsCents: 1500,
  cashOutflowsCents: 1000,
  refundedCash: [],
  expectedCashCents: 4000,
  openingRefCents: 1000,
  openingLocalCents: 0,
  counted: { usdCents: 3900, bsCents: 0, expectedCents: 4000, differenceCents: -100 },
  voidedCount: 2,
  voidedCents: 1500,
  totalCents: 9000,
  salesCount: 4,
  paidCount: 3,
  paidCents: 6000,
  creditCount: 1,
  creditCents: 3000,
  byMethod: [{ paymentMethod: "CASH", totalCents: 4000 }],
  byCurrency: [{ currencyCode: "USD", cents: 4000, refCents: 4000 }],
  byAccount: [{ accountId: null, kind: null, bankKey: null, bankName: null, accountNumber: null, paymentMethod: "CASH", count: 2, refCents: 4000, currencyCode: "USD", cents: 4000 }],
  closed: { closedAt: new Date("2026-11-24T22:00:00Z"), note: null },
};

function html(summary: CashClosingSummary) {
  return renderToStaticMarkup(
    createElement(PrintableCashClosing, {
      summary,
      company: { name: "Comercial Pruebas" } as never,
      branchName: "Sucursal Principal",
      rate: 40,
      currencyCode: "VES",
      exchangeRateEnabled: true,
      referenceCurrency: "USD",
      paperSize: "THERMAL_80",
    })
  ).replace(/<!-- -->/g, "");
}

describe("Corte Z impreso, alineado con el PDF", () => {
  const out = html(base);

  it("separa pagadas y a crédito, y avisa de las anuladas", () => {
    expect(out).toContain("Ventas pagadas (3)");
    expect(out).toContain("A crédito, por cobrar (1)");
    expect(out).toContain("Total vendido (4)");
    expect(out).toContain("Anuladas (2), no suman");
  });

  it("muestra esperado, contado y diferencia por moneda", () => {
    expect(out).toContain("Esperado en dólares");
    expect(out).toContain("Esperado en bolívares");
    expect(out).toContain("Contado en dólares");
    expect(out).toContain("Diferencia en dólares");
    expect(out).toContain("Faltante");
  });

  it("lista salidas y devoluciones con su origen y las de cuenta no restan de la caja", () => {
    expect(out).toContain("Salidas y devoluciones");
    expect(out).toContain("Pago Móvil");
    expect(out).toContain("Banesco · 0414");
    expect(out).toContain("Salidas desde cuentas (no tocan la caja)");
  });

  it("sin conteo en un turno cerrado lo dice", () => {
    expect(html({ ...base, counted: null })).toContain("no se registró conteo");
  });
});

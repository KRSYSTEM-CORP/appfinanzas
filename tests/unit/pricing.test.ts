import { describe, expect, it } from "vitest";
import { resolveTierPrice, tierPriceCents, type TieredProduct } from "@/lib/pricing";

const product: TieredProduct = {
  priceCents: 1000,
  priceTiersEnabled: true,
  wholesalePriceCents: 800,
  wholesaleMinQty: 12,
  bulkPriceCents: 600,
  bulkMinQty: 100,
};

describe("resolveTierPrice", () => {
  it("cobra al detal por debajo del mínimo de mayor", () => {
    expect(resolveTierPrice(product, 11)).toEqual({ tier: "RETAIL", priceCents: 1000 });
  });
  it("cambia a mayor justo en el mínimo", () => {
    expect(resolveTierPrice(product, 12)).toEqual({ tier: "WHOLESALE", priceCents: 800 });
    expect(resolveTierPrice(product, 99)).toEqual({ tier: "WHOLESALE", priceCents: 800 });
  });
  it("cambia a gran mayor en su mínimo", () => {
    expect(resolveTierPrice(product, 100)).toEqual({ tier: "BULK", priceCents: 600 });
  });
  it("ignora los tramos si el producto no los tiene activados", () => {
    expect(resolveTierPrice({ ...product, priceTiersEnabled: false }, 500)).toEqual({ tier: "RETAIL", priceCents: 1000 });
  });
  it("un tramo sin precio o sin mínimo no aplica", () => {
    expect(resolveTierPrice({ ...product, bulkMinQty: null }, 500).tier).toBe("WHOLESALE");
    expect(resolveTierPrice({ ...product, wholesalePriceCents: null, bulkPriceCents: null }, 500).tier).toBe("RETAIL");
  });
});

describe("tierPriceCents", () => {
  it("devuelve el precio del tramo elegido a mano", () => {
    expect(tierPriceCents(product, "RETAIL")).toBe(1000);
    expect(tierPriceCents(product, "WHOLESALE")).toBe(800);
    expect(tierPriceCents(product, "BULK")).toBe(600);
  });
  it("devuelve null si el tramo no existe, para no cobrar un precio inventado", () => {
    expect(tierPriceCents({ ...product, priceTiersEnabled: false }, "WHOLESALE")).toBeNull();
    expect(tierPriceCents({ ...product, bulkPriceCents: null }, "BULK")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { ProductSchema } from "@/lib/validations";

const base = { name: "Jabón", unit: "ml", stock: 10 };

describe("precio mínimo de un producto", () => {
  it("rechaza un precio que se redondea a cero céntimos", () => {
    const r = ProductSchema.safeParse({ ...base, price: 0.004 });
    expect(r.success).toBe(false);
  });
  it("acepta 0,01 y el precio cero explícito", () => {
    expect(ProductSchema.safeParse({ ...base, price: 0.01 }).success).toBe(true);
    expect(ProductSchema.safeParse({ ...base, price: 0 }).success).toBe(true);
  });
});

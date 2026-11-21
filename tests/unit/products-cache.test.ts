import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const invalidate = vi.fn(async (...keys: string[]) => keys.length);
vi.mock("@/lib/cache", () => ({ invalidateCache: (...keys: string[]) => invalidate(...keys) }));

import { invalidateProductsCache, productsCacheKey } from "@/lib/products-cache";

describe("caché de productos", () => {
  beforeEach(() => invalidate.mockClear());

  it("las claves distinguen alcance, empresa y sucursal", () => {
    expect(productsCacheKey("active", "c1", "b1")).toBe("products:active:c1:b1");
    expect(productsCacheKey("all", "c1", null)).toBe("products:all:c1:all");
  });

  it("al invalidar limpia la lista de la sucursal y la de «todas» (activos y todos)", async () => {
    await invalidateProductsCache("c1", "b1");
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(new Set(invalidate.mock.calls[0])).toEqual(
      new Set(["products:active:c1:b1", "products:all:c1:b1", "products:active:c1:all", "products:all:c1:all"])
    );
  });

  it("sin sucursal limpia solo las de «todas»", async () => {
    await invalidateProductsCache("c1", null);
    expect(new Set(invalidate.mock.calls[0])).toEqual(new Set(["products:active:c1:all", "products:all:c1:all"]));
  });
});

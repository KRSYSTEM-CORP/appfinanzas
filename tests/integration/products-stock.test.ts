import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getSession: async () => sessionFor(ctx),
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/cache", () => ({ getOrSetCache: async (_k: string, _t: number, f: () => unknown) => f(), invalidateCache: async () => {} }));

const { updateProduct } = await import("@/lib/actions/products");

let startStock = 0;

// Lo mismo que envía el formulario de edición.
function editForm(
  p: { name: string; sku: string | null; category: string | null; priceCents: number; lowStockThreshold: number; stock: number },
  add: string
) {
  const f = new FormData();
  f.set("name", p.name);
  f.set("sku", p.sku ?? "");
  f.set("category", p.category ?? "");
  f.set("price", String(p.priceCents / 100));
  f.set("trackStock", "true");
  f.set("lowStockThreshold", String(p.lowStockThreshold));
  f.set("stock", String(p.stock)); // valor viejo: el servidor no debe usarlo
  f.set("stockAdd", add);
  return f;
}

beforeAll(async () => {
  ctx = await loadContext();
  startStock = (await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } })).stock;
});

afterAll(async () => {
  await owner.product.update({ where: { id: ctx.productId }, data: { stock: startStock } });
  await owner.stockMovement.deleteMany({ where: { productId: ctx.productId, sourceType: "product", quantityChange: 7 } });
});

describe("Sumar existencias", () => {
  it("suma al stock actual aunque el formulario traiga un número viejo", async () => {
    const p = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    // Una venta ocurre mientras la persona editaba: el stock real baja a p.stock - 3.
    await owner.product.update({ where: { id: ctx.productId }, data: { stock: p.stock - 3 } });
    const r = await updateProduct(ctx.productId, editForm(p, "7"));
    expect(r).toEqual({ success: true });
    const after = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    expect(after.stock).toBe(p.stock - 3 + 7);
  });

  it("deja el movimiento en el historial del producto", async () => {
    const mv = await owner.stockMovement.findFirst({
      where: { productId: ctx.productId, sourceType: "product", quantityChange: 7 },
      orderBy: { createdAt: "desc" },
    });
    expect(mv).not.toBeNull();
  });

  it("rechaza cantidades negativas o decimales", async () => {
    const p = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    expect((await updateProduct(ctx.productId, editForm(p, "-5"))).success).toBe(false);
    expect((await updateProduct(ctx.productId, editForm(p, "2.5"))).success).toBe(false);
    const after = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    expect(after.stock).toBe(p.stock);
  });
});

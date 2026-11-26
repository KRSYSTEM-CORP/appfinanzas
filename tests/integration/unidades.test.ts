import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { customer, loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  requireManagerOrPermission: async () => sessionFor(ctx),
  requireAccountingManagerOrPermission: async () => sessionFor(ctx),
  requireAdminAccess: async () => sessionFor(ctx),
  requireSectionAccess: async () => sessionFor(ctx),
  requireAccountingPlan: async () => sessionFor(ctx),
  hasPermission: () => true,
  requirePurchasesAccess: async () => sessionFor(ctx),
  getSession: async () => sessionFor(ctx),
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/realtime", () => ({ notifyLive: async () => {}, posChannel: (id: string) => id }));
vi.mock("@/lib/cache", () => ({ getOrSetCache: async (_k: string, _t: number, f: () => unknown) => f(), invalidateCache: async () => {} }));

const { createProduct, bulkImportProducts, adjustStock } = await import("@/lib/actions/products");
const { completeSale, voidSale } = await import("@/lib/actions/sales");
const { createPurchase } = await import("@/lib/actions/purchases");

const TAG = `UM${Date.now().toString(36).toUpperCase()}`;
const sku = (s: string) => `${TAG}-${s}`;

function productForm(f: Record<string, string>) {
  const fd = new FormData();
  fd.set("category", "Limpieza");
  for (const [k, v] of Object.entries(f)) fd.set(k, v);
  return fd;
}

async function byTag(s: string) {
  return owner.product.findFirstOrThrow({ where: { companyId: ctx.companyId, branchId: ctx.branchId, sku: sku(s) } });
}

async function sellCredit(items: { productId: string; quantity: number; unit?: string }[]) {
  const r = await completeSale({ ...customer, items, paymentStatus: "CREDIT", idempotencyKey: randomUUID() });
  if (!r.success) throw new Error(r.error);
  return owner.sale.findUniqueOrThrow({ where: { id: r.saleId }, include: { items: true } });
}

beforeAll(async () => {
  ctx = await loadContext();
  const today = new Date(new Date().toISOString().slice(0, 10));
  await owner.cashOpening.upsert({
    where: { branchId_date_shiftNumber: { branchId: ctx.branchId, date: today, shiftNumber: 1 } },
    update: {},
    create: { companyId: ctx.companyId, branchId: ctx.branchId, date: today, amountCents: 0, setById: ctx.userId ?? "test", shiftNumber: 1 },
  });
});

afterAll(async () => {
  const products = await owner.product.findMany({ where: { companyId: ctx.companyId, sku: { startsWith: TAG } }, select: { id: true } });
  const ids = products.map((p) => p.id);
  const sales = await owner.saleItem.findMany({ where: { productId: { in: ids } }, select: { saleId: true } });
  const saleIds = [...new Set(sales.map((s) => s.saleId))];
  await owner.cashOutflow.deleteMany({ where: { saleId: { in: saleIds } } });
  await owner.sale.deleteMany({ where: { id: { in: saleIds } } });
  const purchases = await owner.purchaseItem.findMany({ where: { productId: { in: ids } }, select: { purchaseId: true } });
  await owner.purchase.deleteMany({ where: { id: { in: [...new Set(purchases.map((p) => p.purchaseId))] } } });
  await owner.stockMovement.deleteMany({ where: { productId: { in: ids } } });
  await owner.product.deleteMany({ where: { id: { in: ids } } });
});

describe("productos con unidad de medida", () => {
  it("crea un producto por litro con stock decimal y un coleto por unidad", async () => {
    const a = await createProduct(productForm({ name: "Cloro prueba", sku: sku("CLORO"), price: "2.50", unit: "litro", trackStock: "true", stock: "10", lowStockThreshold: "1" }));
    expect(a).toEqual({ success: true });
    const b = await createProduct(productForm({ name: "Coleto prueba", sku: sku("COLETO"), price: "3", unit: "unidad", trackStock: "true", stock: "20", lowStockThreshold: "2" }));
    expect(b).toEqual({ success: true });
    const cloro = await byTag("CLORO");
    expect(cloro.unit).toBe("litro");
    expect(Number(cloro.stock)).toBe(10);
  });

  it("rechaza stock decimal en una unidad entera y unidad desconocida", async () => {
    const r = await createProduct(productForm({ name: "Escoba mala", sku: sku("MALA"), price: "3", unit: "unidad", trackStock: "true", stock: "2.5", lowStockThreshold: "1" }));
    expect(r.success).toBe(false);
    const r2 = await createProduct(productForm({ name: "Rara", sku: sku("RARA"), price: "3", unit: "furlong", trackStock: "true", stock: "2", lowStockThreshold: "1" }));
    expect(r2.success).toBe(false);
  });
});

describe("ventas con cantidades decimales", () => {
  let saleId = "";
  it("vende 500 ml (guarda 0,5 L) y 2 coletos en la misma venta y descuenta el stock exacto", async () => {
    const cloro = await byTag("CLORO");
    const coleto = await byTag("COLETO");
    const sale = await sellCredit([
      { productId: cloro.id, quantity: 500, unit: "mililitro" },
      { productId: coleto.id, quantity: 2 },
    ]);
    saleId = sale.id;
    const li = sale.items.find((i) => i.productId === cloro.id)!;
    const ci = sale.items.find((i) => i.productId === coleto.id)!;
    expect(Number(li.quantity)).toBe(0.5);
    expect(li.unit).toBe("litro");
    expect(li.subtotalCents).toBe(125); // 2,50 por litro × 0,5
    expect(Number(ci.quantity)).toBe(2);
    expect(ci.subtotalCents).toBe(600);
    expect(sale.totalCents).toBe(725);
    expect(Number((await byTag("CLORO")).stock)).toBe(9.5);
    expect(Number((await byTag("COLETO")).stock)).toBe(18);
  });

  it("vende 2 L y suma al stock decimal", async () => {
    const cloro = await byTag("CLORO");
    const sale = await sellCredit([{ productId: cloro.id, quantity: 2, unit: "litro" }]);
    expect(Number(sale.items[0].quantity)).toBe(2);
    expect(Number((await byTag("CLORO")).stock)).toBe(7.5);
  });

  it("rechaza decimales en unidad entera y más de lo disponible", async () => {
    const coleto = await byTag("COLETO");
    const cloro = await byTag("CLORO");
    await expect(sellCredit([{ productId: coleto.id, quantity: 1.5 }])).rejects.toThrow(/enteras/);
    await expect(sellCredit([{ productId: cloro.id, quantity: 7501, unit: "mililitro" }])).rejects.toThrow(/Stock insuficiente/);
    await expect(sellCredit([{ productId: cloro.id, quantity: 1, unit: "kilogramo" }])).rejects.toThrow();
    expect(Number((await byTag("CLORO")).stock)).toBe(7.5);
  });

  it("anular la venta devuelve el stock exacto", async () => {
    const r = await voidSale(saleId);
    expect(r.success).toBe(true);
    expect(Number((await byTag("CLORO")).stock)).toBe(8);
    expect(Number((await byTag("COLETO")).stock)).toBe(20);
    const moves = await owner.stockMovement.findMany({ where: { sourceId: saleId, reason: "SALE_VOID" } });
    expect(moves.map((m) => Number(m.quantityChange)).sort()).toEqual([0.5, 2]);
  });

  it("ajusta stock con decimales y rechaza decimales en unidad entera", async () => {
    const cloro = await byTag("CLORO");
    const coleto = await byTag("COLETO");
    expect((await adjustStock(cloro.id, "ENTRADA", 0.25)).success).toBe(true);
    expect(Number((await byTag("CLORO")).stock)).toBe(8.25);
    expect((await adjustStock(coleto.id, "SALIDA", 0.5)).success).toBe(false);
  });
});

describe("importación con unidades", () => {
  it("importa un CSV mixto de limpieza e informa la unidad desconocida", async () => {
    const res = await bulkImportProducts([
      { name: "Detergente Lt", sku: sku("DET"), price: 4, unit: "lt", stock: 12.5, lowStockThreshold: 2 },
      { name: "Desinfectante ml", sku: sku("DES"), price: 0.004, unit: "mL", stock: 20000, lowStockThreshold: 1000 },
      { name: "Escoba", sku: sku("ESC"), price: 5, unit: "pza", stock: 30, lowStockThreshold: 5 },
      { name: "Coleto 2", sku: sku("COL2"), price: 3, stock: 15, lowStockThreshold: 5 },
      { name: "Cuerda", sku: sku("CUE"), price: 1, unit: "otra", unitLabel: "rollo", stock: 4, lowStockThreshold: 1 },
      { name: "Rara", sku: sku("RAR"), price: 1, unit: "furlong", stock: 1 },
      { name: "Escoba decimal", sku: sku("ESD"), price: 5, unit: "unidad", stock: 1.5 },
    ]);
    expect(res.created).toBe(5);
    expect(res.failed.map((f) => f.row).sort()).toEqual([6, 7]);
    expect(res.failed.find((f) => f.row === 6)!.error).toMatch(/No reconozco la unidad/);
    expect((await byTag("DET")).unit).toBe("litro");
    expect(Number((await byTag("DET")).stock)).toBe(12.5);
    expect((await byTag("DES")).unit).toBe("mililitro");
    expect((await byTag("ESC")).unit).toBe("pieza");
    expect((await byTag("COL2")).unit).toBe("unidad");
    const cue = await byTag("CUE");
    expect(cue.unit).toBe("otra");
    expect(cue.unitLabel).toBe("rollo");
  });
});

describe("compras con empaque", () => {
  it("compra 3 cajas de 12 unidades y entran 36 al inventario", async () => {
    const coleto = await byTag("COLETO");
    const before = Number(coleto.stock);
    const r = await createPurchase({
      manualSupplierName: "Proveedor prueba unidades",
      invoiceAmount: 36,
      invoiceAmountInForeignCurrency: true,
      paymentStatus: "PENDING",
      items: [{ productId: coleto.id, quantity: 3, packSize: 12, unitCost: 12, unitCostInForeignCurrency: true, taxCategory: "GENERAL", affectsStock: true }],
    });
    expect(r.success).toBe(true);
    expect(Number((await byTag("COLETO")).stock)).toBe(before + 36);
    const item = await owner.purchaseItem.findFirstOrThrow({ where: { productId: coleto.id } });
    expect(Number(item.quantity)).toBe(36);
    expect(item.unitCostCents).toBe(100); // 12 por caja / 12 unidades = 1,00 por unidad
  });
});

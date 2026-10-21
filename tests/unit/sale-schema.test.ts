import { describe, expect, it } from "vitest";
import { RegisterPaymentSchema, SaleSchema } from "@/lib/validations";

const customer = {
  customerFirstName: "Ana",
  customerLastName: "Pérez",
  customerPhone: "04141234567",
  customerAddress: "Valencia",
};
const item = { productId: "p1", quantity: 2 };

describe("SaleSchema", () => {
  it("acepta una venta pagada en efectivo y pasa el monto a céntimos", () => {
    const r = SaleSchema.safeParse({ ...customer, items: [item], payments: [{ paymentMethod: "CASH", amount: "12.34" }] });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.payments[0].amount).toBe(1234);
  });
  it("rechaza un carrito vacío", () => {
    const r = SaleSchema.safeParse({ ...customer, items: [], payments: [{ paymentMethod: "CASH", amount: 1 }] });
    expect(r.success).toBe(false);
  });
  it("exige los datos del cliente", () => {
    const r = SaleSchema.safeParse({ ...customer, customerPhone: " ", items: [item], payments: [{ paymentMethod: "CASH", amount: 1 }] });
    expect(r.success).toBe(false);
  });
  it("una venta pagada necesita al menos un pago", () => {
    expect(SaleSchema.safeParse({ ...customer, items: [item], payments: [] }).success).toBe(false);
  });
  it("una venta a crédito no necesita pagos", () => {
    expect(SaleSchema.safeParse({ ...customer, items: [item], paymentStatus: "CREDIT" }).success).toBe(true);
  });
  it("una venta exonerada (100% de descuento) no necesita pagos", () => {
    expect(SaleSchema.safeParse({ ...customer, items: [item], discountPercent: 100, payments: [] }).success).toBe(true);
  });
  it("Zelle y tarjeta exigen número de referencia", () => {
    expect(SaleSchema.safeParse({ ...customer, items: [item], payments: [{ paymentMethod: "ZELLE", amount: 10 }] }).success).toBe(false);
    expect(
      SaleSchema.safeParse({ ...customer, items: [item], payments: [{ paymentMethod: "ZELLE", amount: 10, reference: "ABC123" }] }).success
    ).toBe(true);
  });
  it("rechaza descuentos fuera de 0–100 y cantidades no enteras", () => {
    expect(SaleSchema.safeParse({ ...customer, items: [item], discountPercent: 120, payments: [] }).success).toBe(false);
    expect(SaleSchema.safeParse({ ...customer, items: [{ productId: "p1", quantity: 1.5 }], paymentStatus: "CREDIT" }).success).toBe(false);
  });
  it("la tasa de una venta sin conexión debe ser positiva", () => {
    expect(SaleSchema.safeParse({ ...customer, items: [item], paymentStatus: "CREDIT", offlineExchangeRate: 0 }).success).toBe(false);
  });
});

describe("RegisterPaymentSchema (abonos)", () => {
  it("exige al menos un pago y montos mayores a 0", () => {
    expect(RegisterPaymentSchema.safeParse({ payments: [] }).success).toBe(false);
    expect(RegisterPaymentSchema.safeParse({ payments: [{ paymentMethod: "CASH", amount: 0 }] }).success).toBe(false);
    expect(RegisterPaymentSchema.safeParse({ payments: [{ paymentMethod: "CASH", amount: 5 }] }).success).toBe(true);
  });
});

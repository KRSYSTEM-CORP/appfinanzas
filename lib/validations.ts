import { z } from "zod";

const pesosToCents = (v: number) => Math.round(v * 100);

export const ProductSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  sku: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  price: z.coerce
    .number()
    .min(0, "El precio no puede ser negativo")
    .transform(pesosToCents),
  cost: z.coerce
    .number()
    .min(0)
    .optional()
    .nullable()
    .transform((v) => (v == null ? v : pesosToCents(v))),
  stock: z.coerce.number().int().min(0, "El stock no puede ser negativo"),
  lowStockThreshold: z.coerce.number().int().min(0),
});

export type ProductInput = z.infer<typeof ProductSchema>;

export const CartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
});

export const SaleSchema = z.object({
  items: z.array(CartItemSchema).min(1, "El carrito está vacío"),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
});

export type SaleInput = z.infer<typeof SaleSchema>;

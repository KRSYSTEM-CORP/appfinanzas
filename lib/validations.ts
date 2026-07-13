import { z } from "zod";

const toCents = (v: number) => Math.round(v * 100);

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
    .transform(toCents),
  cost: z.coerce
    .number()
    .min(0)
    .optional()
    .nullable()
    .transform((v) => (v == null ? v : toCents(v))),
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

export const SignupSchema = z.object({
  companyName: z.string().trim().min(1, "El nombre de la empresa es obligatorio"),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const ExchangeRateSchema = z.object({
  rate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
});

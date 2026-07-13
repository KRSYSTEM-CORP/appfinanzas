import { z } from "zod";

const toCents = (v: number) => Math.round(v * 100);

export const ProductSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  sku: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  category: z
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

export const CustomerSchema = z.object({
  customerFirstName: z.string().trim().min(1, "El nombre es obligatorio"),
  customerLastName: z.string().trim().min(1, "El apellido es obligatorio"),
  customerPhone: z.string().trim().min(1, "El teléfono es obligatorio"),
  customerAddress: z.string().trim().min(1, "La dirección es obligatoria"),
});

export type CustomerInput = z.infer<typeof CustomerSchema>;

export const SaleSchema = z.object({
  items: z.array(CartItemSchema).min(1, "El carrito está vacío"),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER"]).default("CASH"),
  paidInForeignCurrency: z.boolean().default(false),
}).merge(CustomerSchema);

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

export const BrandingSchema = z.object({
  logoDataUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v == null || v.startsWith("data:image/"), "Logo inválido")
    .refine((v) => v == null || v.length < 400_000, "El logo es demasiado grande"),
  brandColor: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v == null || /^#[0-9a-fA-F]{6}$/.test(v), "Color inválido"),
});

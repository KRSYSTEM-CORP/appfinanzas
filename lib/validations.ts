import { z } from "zod";
import { PaymentMethod, TaxCategory } from "@prisma/client";
import { CURRENCIES } from "@/lib/currencies";

const toCents = (v: number) => Math.round(v * 100);

// Trims, collapses internal whitespace, and Unicode-normalizes to NFC.
// Employee login matches firstName/lastName by exact (case-insensitive)
// string comparison against what a manager typed at creation time — without
// NFC normalization, two visually identical accented names (e.g. "José")
// typed on different devices/keyboards can produce different byte sequences
// (NFC vs NFD composition of "é") and silently fail to match, which is what
// was locking out real employees with accented Spanish names.
function nameField(message: string) {
  return z
    .string()
    .transform((v) => v.trim().normalize("NFC").replace(/\s+/g, " "))
    .refine((v) => v.length > 0, message);
}

// Derived directly from the Prisma enum (rather than hand-listed) so adding
// a new payment method to the schema can't silently drift from what this
// validator accepts — a mismatch here previously made new methods fail
// server-side validation with no visible error (the dialog closes
// optimistically regardless of the async result), even though they showed
// up fine as buttons in the UI.
export const PAYMENT_METHOD_VALUES = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];
const PaymentMethodEnum = z.enum(PAYMENT_METHOD_VALUES);

// Same derive-from-the-real-enum reasoning as PAYMENT_METHOD_VALUES above.
export const TAX_CATEGORY_VALUES = Object.values(TaxCategory) as [TaxCategory, ...TaxCategory[]];
// Accepts the Spanish words a shop owner would actually type into an Excel
// cell ("Exento", "Gravado", "Reducido") in addition to the raw enum value
// itself (case-insensitive) — the manual product form always sends the exact
// enum value via a <Select>, so this only changes behavior for bulk imports.
const TAX_CATEGORY_WORD_MAP: Record<string, TaxCategory> = {
  exento: "EXEMPT",
  exenta: "EXEMPT",
  exempt: "EXEMPT",
  reducido: "REDUCED",
  reducida: "REDUCED",
  reduced: "REDUCED",
  general: "GENERAL",
  gravado: "GENERAL",
};
const TaxCategoryEnum = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const normalized = v.trim().toLowerCase();
  return TAX_CATEGORY_WORD_MAP[normalized] ?? v.trim().toUpperCase();
}, z.enum(TAX_CATEGORY_VALUES));
const METHODS_REQUIRING_REFERENCE: (typeof PAYMENT_METHOD_VALUES)[number][] = [
  "CARD",
  "ZELLE",
  "BINANCE",
  "PAYPAL",
  "POS",
  "TRANSFER",
];

// One entry in a split payment (multiple methods covering a single total).
// Reused for sale checkout, credit collection, and maintenance reports.
const PaymentSplitSchema = z.object({
  paymentMethod: PaymentMethodEnum,
  amount: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  paidInForeignCurrency: z.boolean().default(false),
  reference: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

function validatePaymentSplits(
  payments: z.infer<typeof PaymentSplitSchema>[],
  ctx: z.RefinementCtx,
  path: (string | number)[] = ["payments"]
) {
  if (payments.length === 0) {
    ctx.addIssue({ code: "custom", path, message: "Agrega al menos un método de pago" });
    return;
  }
  payments.forEach((p, i) => {
    if (METHODS_REQUIRING_REFERENCE.includes(p.paymentMethod) && !p.reference) {
      ctx.addIssue({
        code: "custom",
        path: [...path, i, "reference"],
        message: "El número de referencia es obligatorio para este método de pago",
      });
    }
  });
}

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
  taxCategory: TaxCategoryEnum.default("GENERAL"),
  image: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v == null || v.startsWith("data:image/"), "Imagen inválida")
    .refine((v) => v == null || v.length < 700_000, "La imagen es demasiado grande"),
});

export type ProductInput = z.infer<typeof ProductSchema>;

// Bulk-update rows (mass update from Excel) find the existing product by its
// internal id (a hidden export column) rather than SKU — SKU is optional on
// products, so many rows may not have one. Every column besides id is
// optional, and a blank cell means "leave this field unchanged" rather than
// "clear it" (unlike ProductSchema above, which is also used for full
// create/import rows where every field is meaningful). blankToUndefined runs
// before z.coerce so an empty string never gets coerced into 0.
const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

export const ProductUpdateRowSchema = z.object({
  id: z.string().trim().min(1, "Falta el identificador interno (no borres ni edites la columna ID)"),
  sku: z.preprocess(blankToUndefined, z.string().trim().optional()),
  name: z.preprocess(blankToUndefined, z.string().trim().optional()),
  category: z.preprocess(blankToUndefined, z.string().trim().optional()),
  price: z
    .preprocess(blankToUndefined, z.coerce.number().min(0, "El precio no puede ser negativo").optional())
    .transform((v) => (v == null ? v : toCents(v))),
  cost: z
    .preprocess(blankToUndefined, z.coerce.number().min(0).optional())
    .transform((v) => (v == null ? v : toCents(v))),
  stock: z.preprocess(blankToUndefined, z.coerce.number().int().min(0, "El stock no puede ser negativo").optional()),
  lowStockThreshold: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).optional()),
  taxCategory: z.preprocess(blankToUndefined, TaxCategoryEnum.optional()),
});

export type ProductUpdateRowInput = z.infer<typeof ProductUpdateRowSchema>;

export const CartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
});

export const CustomerSchema = z.object({
  customerFirstName: z.string().trim().min(1, "El nombre es obligatorio"),
  customerLastName: z.string().trim().min(1, "El apellido es obligatorio"),
  customerPhone: z.string().trim().min(1, "El teléfono es obligatorio"),
  customerAddress: z.string().trim().min(1, "La dirección es obligatoria"),
  customerRif: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export type CustomerInput = z.infer<typeof CustomerSchema>;

export const CustomerRecordSchema = z.object({
  firstName: z.string().trim().min(1, "El nombre es obligatorio"),
  lastName: z.string().trim().min(1, "El apellido es obligatorio"),
  phone: z.string().trim().min(1, "El teléfono es obligatorio"),
  address: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  rif: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export type CustomerRecordInput = z.infer<typeof CustomerRecordSchema>;

// Separate from CustomerRecordSchema above — the ficha de cliente's "CRM"
// view edits only these two fields, independently of the general customer
// record (name/phone/address/rif), which lives on its own "Editar" screen.
export const CustomerCrmSchema = z.object({
  notes: z.preprocess(blankToUndefined, z.string().trim().optional()),
  nextContactDate: z.preprocess(blankToUndefined, z.coerce.date().optional()),
});

export type CustomerCrmInput = z.infer<typeof CustomerCrmSchema>;

export const SaleSchema = z
  .object({
    items: z.array(CartItemSchema).min(1, "El carrito está vacío"),
    paymentStatus: z.enum(["PAID", "CREDIT"]).default("PAID"),
    // Credit sales aren't paid at checkout, so no payment split applies yet —
    // it's captured later when the customer actually pays (see registerPayment).
    payments: z.array(PaymentSplitSchema).default([]),
    // Free-text, optional — printed on the Nota de Entrega/Factura PDF and
    // print view when present (see itemDescription's sibling, renderNote,
    // in lib/delivery-note.ts).
    note: z.preprocess(blankToUndefined, z.string().trim().optional()),
  })
  .merge(CustomerSchema)
  .superRefine((data, ctx) => {
    if (data.paymentStatus === "PAID") {
      validatePaymentSplits(data.payments, ctx);
    }
  });

export type SaleInput = z.infer<typeof SaleSchema>;

export const RegisterPaymentSchema = z.object({
  payments: z.array(PaymentSplitSchema),
}).superRefine((data, ctx) => validatePaymentSplits(data.payments, ctx));

export type RegisterPaymentInput = z.infer<typeof RegisterPaymentSchema>;

export const QuoteSchema = z.object({
  items: z.array(CartItemSchema).min(1, "El carrito está vacío"),
  note: z.preprocess(blankToUndefined, z.string().trim().optional()),
}).merge(CustomerSchema);

export type QuoteInput = z.infer<typeof QuoteSchema>;

export const SignupSchema = z.object({
  companyName: z.string().trim().min(1, "El nombre de la empresa es obligatorio"),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    newPassword: z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

export const EmployeeLoginSchema = z.object({
  companyCode: z.string().trim().min(1, "El código de empresa es obligatorio"),
  firstName: nameField("El nombre es obligatorio"),
  lastName: nameField("El apellido es obligatorio"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

const RoleSchema = z.enum(["GERENTE", "VENDEDOR"]);

// A GERENTE has no fixed branch (sees "Todas las sucursales"), but a
// VENDEDOR must be pinned to exactly one — enforced below since which
// branches actually exist can only be checked once we're inside the action.
const branchIdField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const EmployeeSchema = z
  .object({
    firstName: nameField("El nombre es obligatorio"),
    lastName: nameField("El apellido es obligatorio"),
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    role: RoleSchema,
    branchId: branchIdField,
  })
  .refine((data) => data.role !== "VENDEDOR" || data.branchId, {
    message: "Selecciona la sucursal del vendedor",
    path: ["branchId"],
  });

export const ExpenseSchema = z.object({
  description: z.string().trim().min(1, "La descripción es obligatoria"),
  category: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  spentAt: z.coerce.date(),
});

export const EmployeeUpdateSchema = z
  .object({
    firstName: nameField("El nombre es obligatorio"),
    lastName: nameField("El apellido es obligatorio"),
    role: RoleSchema,
    branchId: branchIdField,
    // Empty string means "keep the current password" — only validated as a
    // password when the manager actually typed a new one.
    password: z
      .string()
      .optional()
      .transform((v) => (v === "" ? undefined : v))
      .refine((v) => v === undefined || v.length >= 8, "La contraseña debe tener al menos 8 caracteres"),
  })
  .refine((data) => data.role !== "VENDEDOR" || data.branchId, {
    message: "Selecciona la sucursal del vendedor",
    path: ["branchId"],
  });

export const ExchangeRateSchema = z.object({
  rate: z.coerce.number().positive("La tasa debe ser mayor a 0"),
});

export const LocalCurrencySchema = z.object({
  localCurrencyCode: z
    .string()
    .trim()
    .refine((v) => CURRENCIES.some((c) => c.code === v), "Moneda no reconocida"),
});

export const ReferenceCurrencySettingsSchema = z.object({
  // Checkboxes only appear in FormData when checked, so the client sends an
  // explicit "true"/"false" string instead — coerce that directly rather
  // than relying on the field's mere presence.
  exchangeRateEnabled: z.enum(["true", "false"]).transform((v) => v === "true"),
  referenceCurrency: z.enum(["EUR", "USD"]),
});

export const PrintPaperSizeSchema = z.object({
  printPaperSize: z.enum(["THERMAL_58", "THERMAL_80", "LETTER", "A4"]),
});

export const BillingCycleSchema = z.object({
  monthlyFee: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  nextPaymentDueDate: z.coerce.date(),
});

export type BillingCycleInput = z.infer<typeof BillingCycleSchema>;

export const MaintenancePaymentSchema = z.object({
  amount: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  periodEnd: z.coerce.date(),
  note: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type MaintenancePaymentInput = z.infer<typeof MaintenancePaymentSchema>;

const PaymentReportLineSchema = z.object({
  paymentMethod: PaymentMethodEnum,
  amount: z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents),
  reference: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const PaymentReportSchema = z
  .object({
    lines: z.array(PaymentReportLineSchema),
    proofImageDataUrl: z
      .string()
      .trim()
      .min(1, "El comprobante de pago es obligatorio")
      .refine((v) => v.startsWith("data:image/"), "Comprobante inválido")
      .refine((v) => v.length < 3_000_000, "El comprobante es demasiado grande"),
    note: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  })
  .superRefine((data, ctx) => {
    if (data.lines.length === 0) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Agrega al menos un método de pago" });
      return;
    }
    data.lines.forEach((line, i) => {
      if (METHODS_REQUIRING_REFERENCE.includes(line.paymentMethod) && !line.reference) {
        ctx.addIssue({
          code: "custom",
          path: ["lines", i, "reference"],
          message: "El número de referencia es obligatorio para este método de pago",
        });
      }
    });
  });

export type PaymentReportInput = z.infer<typeof PaymentReportSchema>;

export const RejectPaymentReportSchema = z.object({
  reviewNote: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const PlatformSettingsSchema = z.object({
  paymentInstructions: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  billingExchangeRate: z.coerce.number().positive("La tasa debe ser mayor a 0").optional(),
});

export const FiscalDataSchema = z.object({
  fiscalLegalName: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  fiscalRif: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  fiscalAddress: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  fiscalPhone: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
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
  brandBackground: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v == null || /^#[0-9a-fA-F]{6}$/.test(v), "Color inválido"),
});

export const IvaSettingsSchema = z.object({
  ivaGeneralRatePercent: z.coerce.number().int().min(0).max(100),
  ivaReducedRatePercent: z.coerce.number().int().min(0).max(100),
  isIvaWithholdingAgent: z.enum(["true", "false"]).transform((v) => v === "true"),
  ivaWithholdingPercent: z.coerce.number().int().min(0).max(100),
});

export type IvaSettingsInput = z.infer<typeof IvaSettingsSchema>;

export const SupplierSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  rif: z.preprocess(blankToUndefined, z.string().trim().optional()),
  phone: z.preprocess(blankToUndefined, z.string().trim().optional()),
  address: z.preprocess(blankToUndefined, z.string().trim().optional()),
  email: z.preprocess(
    blankToUndefined,
    z.string().trim().email("Correo inválido").optional()
  ),
});

export type SupplierInput = z.infer<typeof SupplierSchema>;

const PurchaseItemSchema = z.object({
  productId: z.string().trim().min(1, "Selecciona un producto"),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a 0"),
  unitCost: z.coerce.number().min(0, "El costo no puede ser negativo").transform(toCents),
  taxCategory: TaxCategoryEnum,
});

export const PurchaseSchema = z.object({
  supplierId: z.string().trim().min(1, "Selecciona un proveedor"),
  supplierInvoiceNo: z.preprocess(blankToUndefined, z.string().trim().optional()),
  items: z.array(PurchaseItemSchema).min(1, "Agrega al menos un producto"),
  paymentStatus: z.enum(["PAID", "PENDING"]).default("PENDING"),
  note: z.preprocess(blankToUndefined, z.string().trim().optional()),
});

export type PurchaseInput = z.infer<typeof PurchaseSchema>;

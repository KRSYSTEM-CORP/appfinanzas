import { z } from "zod";
import { PaymentMethod, TaxCategory } from "@prisma/client";
import { CURRENCIES } from "@/lib/currencies";
import { zonedDateStringToUtc } from "@/lib/report-types";

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

// Accepts the words a shop owner would actually type into an Excel cell or
// toggle in the form ("Sí"/"No", "true"/"false", "1"/"0") for the two
// optional-feature toggles below (trackStock, priceTiersEnabled).
const YES_WORDS = new Set(["true", "si", "sí", "yes", "1"]);
const NO_WORDS = new Set(["false", "no", "0"]);
function coerceBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (YES_WORDS.has(s)) return true;
    if (NO_WORDS.has(s)) return false;
  }
  return undefined;
}
// defaultValue only applies when the cell/field is genuinely absent — an
// unrecognized non-empty value is left as-is so z.boolean() rejects it with
// a normal validation error instead of silently defaulting.
function booleanFieldWithDefault(defaultValue: boolean) {
  return z.preprocess((v) => {
    if (v === undefined || v === "") return defaultValue;
    return coerceBoolean(v) ?? v;
  }, z.boolean());
}

// Runs before z.coerce.number() so a blank Excel cell (or an untouched
// optional form field, which submits "") is treated as "not provided"
// rather than being coerced into 0 — Number("") is 0, not NaN, so without
// this a blank "Cantidad mínima al mayor" cell would silently become 0 and
// fail its own .min(1) check with Zod's raw English default message instead
// of just being left unset.
const blankToUndefined = (v: unknown) => (v === "" || v == null ? undefined : v);

export const ProductSchema = z
  .object({
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
    cost: z
      .preprocess(blankToUndefined, z.coerce.number().min(0).optional().nullable())
      .transform((v) => (v == null ? v : toCents(v as number))),
    // Required only when trackStock is on — see the .refine below.
    trackStock: booleanFieldWithDefault(true),
    stock: z.preprocess(
      blankToUndefined,
      z.coerce.number().int().min(0, "El stock no puede ser negativo").optional()
    ),
    lowStockThreshold: z
      .preprocess(blankToUndefined, z.coerce.number().int().min(0).optional())
      .transform((v) => v ?? 5),
    taxCategory: TaxCategoryEnum.default("GENERAL"),
    image: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v === "" ? undefined : v))
      .refine((v) => v == null || v.startsWith("data:image/"), "Imagen inválida")
      .refine((v) => v == null || v.length < 700_000, "La imagen es demasiado grande"),
    // Quantity-based pricing — off by default; each tier (mayor/gran mayor)
    // is only meaningful once both its price and minimum quantity are set
    // together. See lib/pricing.ts's resolveTierPrice for how these combine
    // with priceCents at checkout.
    priceTiersEnabled: booleanFieldWithDefault(false),
    wholesalePrice: z
      .preprocess(blankToUndefined, z.coerce.number().min(0).optional().nullable())
      .transform((v) => (v == null ? v : toCents(v as number))),
    wholesaleMinQty: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional().nullable()),
    bulkPrice: z
      .preprocess(blankToUndefined, z.coerce.number().min(0).optional().nullable())
      .transform((v) => (v == null ? v : toCents(v as number))),
    bulkMinQty: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional().nullable()),
  })
  .refine((d) => !d.trackStock || d.stock != null, {
    message: "El stock es obligatorio cuando controlas el stock de este producto",
    path: ["stock"],
  })
  .refine((d) => (d.wholesalePrice == null) === (d.wholesaleMinQty == null), {
    message: "Indica el precio y la cantidad mínima al mayor juntos, o deja ambos vacíos",
    path: ["wholesaleMinQty"],
  })
  .refine((d) => (d.bulkPrice == null) === (d.bulkMinQty == null), {
    message: "Indica el precio y la cantidad mínima al gran mayor juntos, o deja ambos vacíos",
    path: ["bulkMinQty"],
  })
  .refine((d) => d.wholesaleMinQty == null || d.bulkMinQty == null || d.bulkMinQty > d.wholesaleMinQty, {
    message: "La cantidad mínima al gran mayor debe ser mayor que la del mayor",
    path: ["bulkMinQty"],
  });

export type ProductInput = z.infer<typeof ProductSchema>;

// Bulk-update rows (mass update from Excel) find the existing product by its
// internal id (a hidden export column) rather than SKU — SKU is optional on
// products, so many rows may not have one. Every column besides id is
// optional, and a blank cell means "leave this field unchanged" rather than
// "clear it" (unlike ProductSchema above, which is also used for full
// create/import rows where every field is meaningful). Reuses the same
// blankToUndefined defined above ProductSchema.
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
  trackStock: z.preprocess((v) => (v === "" || v == null ? undefined : (coerceBoolean(v) ?? v)), z.boolean().optional()),
  priceTiersEnabled: z.preprocess(
    (v) => (v === "" || v == null ? undefined : (coerceBoolean(v) ?? v)),
    z.boolean().optional()
  ),
  wholesalePrice: z
    .preprocess(blankToUndefined, z.coerce.number().min(0).optional())
    .transform((v) => (v == null ? v : toCents(v))),
  wholesaleMinQty: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
  bulkPrice: z
    .preprocess(blankToUndefined, z.coerce.number().min(0).optional())
    .transform((v) => (v == null ? v : toCents(v))),
  bulkMinQty: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).optional()),
});

export type ProductUpdateRowInput = z.infer<typeof ProductUpdateRowSchema>;

export const CartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  // Seller's manual override of which price tier to charge (see
  // lib/pricing.ts) — omitted means auto-detect from quantity. Only POS
  // checkout (completeSale) reads this; Quote items ignore it.
  priceTier: z.enum(["RETAIL", "WHOLESALE", "BULK"]).optional(),
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
    // 0-100 — applied proportionally to every item's subtotal BEFORE tax is
    // decomposed (see completeSale), so the IVA on the printed factura is
    // correctly computed on the discounted base, not just subtracted from an
    // already-taxed total.
    discountPercent: z.coerce.number().min(0, "El descuento no puede ser negativo").max(100, "Máximo 100%").default(0),
    // Free-text, optional — printed on the Nota de Entrega/Factura PDF and
    // print view when present (see itemDescription's sibling, renderNote,
    // in lib/delivery-note.ts).
    note: z.preprocess(blankToUndefined, z.string().trim().optional()),
    // Present only when this sale was created via the "Facturar" flow from
    // an existing Quote (see getQuoteForConversion, lib/actions/quotes.ts,
    // and completeSale, lib/actions/sales.ts) — links Sale.quoteId and
    // flips the quote's status to CONVERTED in the same transaction.
    quoteId: z.preprocess(blankToUndefined, z.string().trim().optional()),
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
  useLocalCurrency: z.boolean().default(true),
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

export const RequestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido"),
});

export const ResetPasswordSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
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
    // Which sections this employee can access (see lib/sections.ts) —
    // irrelevant for GERENTE. Empty means unrestricted.
    allowedSections: z.array(z.string()).default([]),
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
  spentAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .transform((v) => zonedDateStringToUtc(v)),
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
    allowedSections: z.array(z.string()).default([]),
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

// Both fields are optional: leaving them blank lets approveUser apply the
// automatic defaults (platform default fee, 14-day trial) — an admin only
// needs to fill these in to override that default for a specific company.
export const BillingCycleSchema = z.object({
  monthlyFee: z.preprocess(
    blankToUndefined,
    z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents).optional()
  ),
  nextPaymentDueDate: z.preprocess(blankToUndefined, z.coerce.date().optional()),
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
    // No longer collected in-app — the comprobante is sent by WhatsApp
    // instead (see app/billing/page.tsx). Kept optional, not removed, so
    // PaymentReport.proofImageDataUrl still displays for reports submitted
    // before this change.
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

export const AnnouncementSchema = z.object({
  subject: z.string().trim().min(1, "El asunto es obligatorio"),
  message: z.string().trim().min(1, "El mensaje es obligatorio"),
});

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
  binanceQrDataUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  binanceId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  defaultMonthlyFee: z.preprocess(
    blankToUndefined,
    z.coerce.number().positive("El monto debe ser mayor a 0").transform(toCents).optional()
  ),
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
  // Raw amount as typed, still in whatever currency unitCostInForeignCurrency
  // selects — createPurchase resolves it to reference-currency cents server-
  // side (same pattern as a payment-split row), so the exchange rate used is
  // always the one on file at the moment the purchase is saved, never a
  // value trusted from the client.
  unitCost: z.coerce.number().min(0, "El costo no puede ser negativo").transform(toCents),
  // true = entered directly in the company's reference currency (Euro/Dólar
  // BCV) — the only option that existed before this toggle, kept as the
  // default so old behavior is unchanged when a caller omits this field
  // (e.g. bulk import, which has no currency toggle of its own).
  unitCostInForeignCurrency: z.boolean().default(true),
  taxCategory: TaxCategoryEnum,
  // Off means this line still lands in the libro de compras but never
  // touches Product.stock/costCents — for a purchase that isn't tracked
  // inventory. On by default.
  affectsStock: booleanFieldWithDefault(true),
});

export const PurchaseSchema = z
  .object({
    supplierId: z.string().trim().min(1, "Selecciona un proveedor"),
    supplierInvoiceNo: z.preprocess(blankToUndefined, z.string().trim().optional()),
    items: z.array(PurchaseItemSchema).min(1, "Agrega al menos un producto"),
    // The real total on the supplier's paper invoice, entered manually —
    // this becomes Purchase.totalCents (see createPurchase), overriding the
    // sum of the line items above rather than just cross-checking it: the
    // line items are each merchant's own per-product cost *estimate*, while
    // this is the actual, legally-binding invoice total. createPurchase
    // proportionally rescales each line's base/tax/cost to this real total
    // once it's known.
    invoiceAmount: z.coerce.number().positive("Ingresa el monto de la factura").transform(toCents),
    invoiceAmountInForeignCurrency: z.boolean().default(true),
    paymentStatus: z.enum(["PAID", "PENDING"]).default("PENDING"),
    // Same split-by-method/currency model as a POS sale (see SaleSchema's
    // own `payments` + PaymentSplitBuilder) — only required/validated when
    // the purchase is paid up front; a credit purchase has nothing to
    // record here yet (see registerPurchasePayment-style abono, mirrors
    // registerPayment for sales, if that's ever added).
    payments: z.array(PaymentSplitSchema).default([]),
    note: z.preprocess(blankToUndefined, z.string().trim().optional()),
  })
  .superRefine((data, ctx) => {
    if (data.paymentStatus === "PAID") {
      validatePaymentSplits(data.payments, ctx);
    }
  });

export type PurchaseInput = z.infer<typeof PurchaseSchema>;

// One Excel row per product line. Rows sharing the same supplier + invoice
// number are grouped into a single Purchase with several line items (see
// bulkImportPurchases, lib/actions/purchases.ts) — taxCategory is optional
// here (unlike the manual-form PurchaseItemSchema above) since a bulk import
// falls back to the product's own existing tax category when the column is
// left blank.
const PAYMENT_STATUS_WORD_MAP: Record<string, "PAID" | "PENDING"> = {
  contado: "PAID",
  pagada: "PAID",
  pagado: "PAID",
  paid: "PAID",
  credito: "PENDING",
  "crédito": "PENDING",
  pending: "PENDING",
  "por pagar": "PENDING",
};
export const BulkPurchaseRowSchema = z
  .object({
    supplierName: z.string().trim().min(1, "El proveedor es obligatorio"),
    supplierInvoiceNo: z.preprocess(blankToUndefined, z.string().trim().optional()),
    productSku: z.preprocess(blankToUndefined, z.string().trim().optional()),
    productName: z.preprocess(blankToUndefined, z.string().trim().optional()),
    quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a 0"),
    unitCost: z.coerce.number().min(0, "El costo no puede ser negativo").transform(toCents),
    taxCategory: z.preprocess(
      (v) => (v === "" || v == null ? undefined : v),
      TaxCategoryEnum.optional()
    ),
    paymentStatus: z.preprocess((v) => {
      if (typeof v !== "string" || v.trim() === "") return undefined;
      return PAYMENT_STATUS_WORD_MAP[v.trim().toLowerCase()] ?? v.trim().toUpperCase();
    }, z.enum(["PAID", "PENDING"]).optional()),
    affectsStock: booleanFieldWithDefault(true),
    note: z.preprocess(blankToUndefined, z.string().trim().optional()),
  })
  .refine((data) => data.productSku || data.productName, {
    message: "Indica el SKU o el nombre del producto",
    path: ["productSku"],
  });

export type BulkPurchaseRowInput = z.infer<typeof BulkPurchaseRowSchema>;

"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { fetchBcvRate } from "@/lib/bcv-rate";
import {
  BrandingSchema,
  ChangePasswordSchema,
  ExchangeRateSchema,
  FiscalDataSchema,
  IvaSettingsSchema,
  LocalCurrencySchema,
  PrintPaperSizeSchema,
  ReferenceCurrencySettingsSchema,
} from "@/lib/validations";
import { DEFAULT_CURRENCY_CODE } from "@/lib/currencies";
import type { ActionResult } from "@/lib/types";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

export type ExchangeRateInfo = {
  rate: number | null;
  updatedAt: Date | null;
  localCurrencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
};

export async function getExchangeRateInfo(): Promise<ExchangeRateInfo> {
  const { companyId } = await requireSession();
  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({
      where: { id: companyId },
      select: {
        exchangeRate: true,
        exchangeRateUpdatedAt: true,
        localCurrencyCode: true,
        exchangeRateEnabled: true,
        referenceCurrency: true,
        printPaperSize: true,
      },
    })
  );
  return {
    rate: company?.exchangeRate != null ? Number(company.exchangeRate) : null,
    updatedAt: company?.exchangeRateUpdatedAt ?? null,
    localCurrencyCode: company?.localCurrencyCode ?? DEFAULT_CURRENCY_CODE,
    exchangeRateEnabled: company?.exchangeRateEnabled ?? true,
    referenceCurrency: company?.referenceCurrency ?? "EUR",
    printPaperSize: company?.printPaperSize ?? "LETTER",
  };
}

export async function updatePrintPaperSize(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = PrintPaperSizeSchema.safeParse({
    printPaperSize: formData.get("printPaperSize"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: { printPaperSize: parsed.data.printPaperSize },
    })
  );

  revalidatePath("/settings");
  return { success: true };
}

export async function updateReferenceCurrencySettings(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = ReferenceCurrencySettingsSchema.safeParse({
    exchangeRateEnabled: formData.get("exchangeRateEnabled"),
    referenceCurrency: formData.get("referenceCurrency"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: {
        exchangeRateEnabled: parsed.data.exchangeRateEnabled,
        referenceCurrency: parsed.data.referenceCurrency,
      },
    })
  );

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  revalidatePath("/documents");
  revalidatePath("/quotes");
  return { success: true };
}

export type IvaSettingsInfo = {
  ivaGeneralRatePercent: number;
  ivaReducedRatePercent: number;
  isIvaWithholdingAgent: boolean;
  ivaWithholdingPercent: number;
};

export async function getIvaSettings(): Promise<IvaSettingsInfo> {
  const { companyId } = await requireSession();
  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({
      where: { id: companyId },
      select: {
        ivaGeneralRatePercent: true,
        ivaReducedRatePercent: true,
        isIvaWithholdingAgent: true,
        ivaWithholdingPercent: true,
      },
    })
  );
  return {
    ivaGeneralRatePercent: company?.ivaGeneralRatePercent ?? 16,
    ivaReducedRatePercent: company?.ivaReducedRatePercent ?? 8,
    isIvaWithholdingAgent: company?.isIvaWithholdingAgent ?? false,
    ivaWithholdingPercent: company?.ivaWithholdingPercent ?? 75,
  };
}

export async function updateIvaSettings(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = IvaSettingsSchema.safeParse({
    ivaGeneralRatePercent: formData.get("ivaGeneralRatePercent"),
    ivaReducedRatePercent: formData.get("ivaReducedRatePercent"),
    isIvaWithholdingAgent: formData.get("isIvaWithholdingAgent"),
    ivaWithholdingPercent: formData.get("ivaWithholdingPercent"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) => tx.company.update({ where: { id: companyId }, data: parsed.data }));

  revalidatePath("/settings");
  return { success: true };
}

export async function updateLocalCurrency(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = LocalCurrencySchema.safeParse({
    localCurrencyCode: formData.get("localCurrencyCode"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Moneda inválida" };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: { localCurrencyCode: parsed.data.localCurrencyCode },
    })
  );

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  revalidatePath("/documents");
  revalidatePath("/quotes");
  return { success: true };
}

export async function updateExchangeRate(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = ExchangeRateSchema.safeParse({ rate: formData.get("rate") });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Tasa inválida" };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: { exchangeRate: parsed.data.rate, exchangeRateUpdatedAt: new Date() },
    })
  );

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  return { success: true };
}

// Manual on-demand refresh for a single company — the same rate also gets
// pulled automatically once a day for every VES company by the cron job at
// app/api/cron/bcv-rate/route.ts, so this button is just for "I don't want
// to wait for tonight's run."
export async function fetchAndUpdateBcvRate(): Promise<ActionResult> {
  const { companyId } = await requireSession();

  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({ where: { id: companyId }, select: { localCurrencyCode: true, referenceCurrency: true } })
  );
  if (company?.localCurrencyCode !== "VES") {
    return { success: false, error: "La tasa del BCV solo aplica para bolívares (VES)." };
  }

  let rate: number;
  try {
    rate = await fetchBcvRate(company.referenceCurrency);
  } catch {
    return { success: false, error: "No se pudo consultar la tasa del BCV. Intenta de nuevo." };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: { exchangeRate: rate, exchangeRateUpdatedAt: new Date() },
    })
  );

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  return { success: true };
}

export type BrandingInfo = {
  logoDataUrl: string | null;
  brandColor: string | null;
  brandBackground: string | null;
};

// Used unconditionally by the root layout for page chrome (logo/brand color)
// on every request, including the /blocked page itself — so this reads the
// session directly instead of requireSession(), which would redirect a
// billing-blocked company back to /blocked and loop forever.
export async function getBranding(): Promise<BrandingInfo> {
  const session = await getSession();
  if (!session) return { logoDataUrl: null, brandColor: null, brandBackground: null };
  const { companyId } = session;
  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({
      where: { id: companyId },
      select: { logoDataUrl: true, brandColor: true, brandBackground: true },
    })
  );
  return {
    logoDataUrl: company?.logoDataUrl ?? null,
    brandColor: company?.brandColor ?? null,
    brandBackground: company?.brandBackground ?? null,
  };
}

export async function updateBranding(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = BrandingSchema.safeParse({
    logoDataUrl: formData.get("logoDataUrl") || undefined,
    brandColor: formData.get("brandColor") || undefined,
    brandBackground: formData.get("brandBackground") || undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: {
        logoDataUrl: parsed.data.logoDataUrl ?? null,
        brandColor: parsed.data.brandColor ?? null,
        brandBackground: parsed.data.brandBackground ?? null,
      },
    })
  );

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

export type FiscalData = {
  fiscalLegalName: string | null;
  fiscalRif: string | null;
  fiscalAddress: string | null;
  fiscalPhone: string | null;
};

export async function getFiscalData(): Promise<FiscalData> {
  const { companyId } = await requireSession();
  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({
      where: { id: companyId },
      select: { fiscalLegalName: true, fiscalRif: true, fiscalAddress: true, fiscalPhone: true },
    })
  );
  return {
    fiscalLegalName: company?.fiscalLegalName ?? null,
    fiscalRif: company?.fiscalRif ?? null,
    fiscalAddress: company?.fiscalAddress ?? null,
    fiscalPhone: company?.fiscalPhone ?? null,
  };
}

export async function updateFiscalData(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = FiscalDataSchema.safeParse({
    fiscalLegalName: formData.get("fiscalLegalName") || undefined,
    fiscalRif: formData.get("fiscalRif") || undefined,
    fiscalAddress: formData.get("fiscalAddress") || undefined,
    fiscalPhone: formData.get("fiscalPhone") || undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: {
        fiscalLegalName: parsed.data.fiscalLegalName ?? null,
        fiscalRif: parsed.data.fiscalRif ?? null,
        fiscalAddress: parsed.data.fiscalAddress ?? null,
        fiscalPhone: parsed.data.fiscalPhone ?? null,
      },
    })
  );

  revalidatePath("/settings");
  return { success: true };
}

// Lets the signed-in user (owner or employee — both are User rows, see
// prisma/schema.prisma) change their own password from Settings. Scoped by
// companyId via withTenant like every other mutation here, even though a
// user can only ever update their own row (userId comes from the session,
// not from form input).
export async function changeMyPassword(formData: FormData): Promise<ActionResult> {
  const { userId, companyId } = await requireSession();
  const parsed = ChangePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const user = await withTenant(companyId, (tx) => tx.user.findFirst({ where: { id: userId, companyId } }));
  // user.passwordHash is null for an account that only ever signed up with
  // Google — there's no current password to check, so this form isn't a way
  // for them to set an initial one (they can keep using Google to log in).
  if (!user || !user.passwordHash || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
    return { success: false, error: "La contraseña actual es incorrecta" };
  }

  await withTenant(companyId, (tx) =>
    tx.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(parsed.data.newPassword) } })
  );

  return { success: true };
}

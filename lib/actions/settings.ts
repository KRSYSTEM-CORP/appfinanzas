"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { BrandingSchema, ExchangeRateSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

export type ExchangeRateInfo = {
  rate: number | null;
  updatedAt: Date | null;
};

export async function getExchangeRateInfo(): Promise<ExchangeRateInfo> {
  const { companyId } = await requireSession();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { exchangeRate: true, exchangeRateUpdatedAt: true },
  });
  return {
    rate: company?.exchangeRate != null ? Number(company.exchangeRate) : null,
    updatedAt: company?.exchangeRateUpdatedAt ?? null,
  };
}

export async function updateExchangeRate(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = ExchangeRateSchema.safeParse({ rate: formData.get("rate") });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Tasa inválida" };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { exchangeRate: parsed.data.rate, exchangeRateUpdatedAt: new Date() },
  });

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/reports");
  return { success: true };
}

export type BrandingInfo = {
  logoDataUrl: string | null;
  brandColor: string | null;
};

export async function getBranding(): Promise<BrandingInfo> {
  const { companyId } = await requireSession();
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { logoDataUrl: true, brandColor: true },
  });
  return {
    logoDataUrl: company?.logoDataUrl ?? null,
    brandColor: company?.brandColor ?? null,
  };
}

export async function updateBranding(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = BrandingSchema.safeParse({
    logoDataUrl: formData.get("logoDataUrl") || undefined,
    brandColor: formData.get("brandColor") || undefined,
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      logoDataUrl: parsed.data.logoDataUrl ?? null,
      brandColor: parsed.data.brandColor ?? null,
    },
  });

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: true };
}

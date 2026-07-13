"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ExchangeRateSchema } from "@/lib/validations";
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

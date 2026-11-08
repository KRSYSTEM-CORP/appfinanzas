"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import type { ActionResult } from "@/lib/types";
import type { PaymentAccountKind } from "@prisma/client";

export type PaymentAccountRow = {
  id: string;
  kind: PaymentAccountKind;
  bankKey: string | null;
  bankName: string | null;
  holder: string | null;
  accountNumber: string;
  docId: string | null;
  note: string | null;
  active: boolean;
};

const AccountSchema = z.object({
  kind: z.enum(["PAGO_MOVIL", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL"]),
  bankKey: z.string().trim().max(40).optional(),
  bankName: z.string().trim().max(80).optional(),
  holder: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().min(3, "Escribe el dato de la cuenta").max(120),
  docId: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
});

// Todos los usuarios de la empresa los ven (el POS los muestra al cobrar).
export async function listPaymentAccounts(onlyActive = true): Promise<PaymentAccountRow[]> {
  const { companyId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.paymentAccount.findMany({
      where: { companyId, ...(onlyActive ? { active: true } : {}) },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      select: {
        id: true, kind: true, bankKey: true, bankName: true, holder: true,
        accountNumber: true, docId: true, note: true, active: true,
      },
    })
  );
}

export async function savePaymentAccount(input: unknown, id?: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = AccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  const data = {
    kind: d.kind,
    bankKey: d.bankKey || null,
    bankName: d.bankName || null,
    holder: d.holder || null,
    accountNumber: d.accountNumber,
    docId: d.docId || null,
    note: d.note || null,
  };
  await withTenant(companyId, async (tx) => {
    if (id) await tx.paymentAccount.updateMany({ where: { id, companyId }, data });
    else await tx.paymentAccount.create({ data: { ...data, companyId } });
  });
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function setPaymentAccountActive(id: string, active: boolean): Promise<ActionResult> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.paymentAccount.updateMany({ where: { id, companyId }, data: { active } }));
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function deletePaymentAccount(id: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.paymentAccount.deleteMany({ where: { id, companyId } }));
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

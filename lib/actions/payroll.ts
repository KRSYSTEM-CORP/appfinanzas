"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccountingPlan } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { computeFortnight, isValidPeriod } from "@/lib/payroll";
import type { ActionResult } from "@/lib/types";
import type { PaymentMethod } from "@prisma/client";

const EmployeeSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  nationalId: z.string().trim().optional(),
  position: z.string().trim().optional(),
  baseCents: z.number().int().min(1, "El sueldo base debe ser mayor a 0"),
  foodBonusCents: z.number().int().min(0, "El bono no puede ser negativo").default(0),
});

export type PayrollEmployeeRow = {
  id: string;
  name: string;
  nationalId: string | null;
  position: string | null;
  baseCents: number;
  foodBonusCents: number;
  active: boolean;
};

export type PayrollPaymentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  nationalId: string | null;
  position: string | null;
  period: string;
  grossCents: number;
  deductionsCents: number;
  advanceCents: number;
  netCents: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  hasProof: boolean;
  paidAt: Date;
};

async function requirePayrollManager() {
  // Contabilidad (Pyme y Corporativo) y solo gerente.
  const session = await requireAccountingPlan();
  if (session.role !== "GERENTE" && !session.isSuperAdmin) throw new Error("Solo el gerente puede gestionar la nómina");
  return session;
}

export async function listPayroll(): Promise<{ employees: PayrollEmployeeRow[]; payments: PayrollPaymentRow[] }> {
  const { companyId } = await requirePayrollManager();
  return withTenant(companyId, async (tx) => {
    const [employees, payments] = await Promise.all([
      tx.payrollEmployee.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      tx.payrollPayment.findMany({
        where: { companyId },
        orderBy: { paidAt: "desc" },
        take: 100,
        include: { employee: { select: { name: true, nationalId: true, position: true } } },
      }),
    ]);
    return {
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        nationalId: e.nationalId,
        position: e.position,
        baseCents: e.baseCents,
        foodBonusCents: e.foodBonusCents,
        active: e.active,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        employeeId: p.employeeId,
        employeeName: p.employee.name,
        nationalId: p.employee.nationalId,
        position: p.employee.position,
        period: p.period,
        grossCents: p.grossCents,
        deductionsCents: p.deductionsCents,
        advanceCents: p.advanceCents,
        netCents: p.netCents,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        hasProof: p.proofDataUrl != null,
        paidAt: p.paidAt,
      })),
    };
  });
}

export async function getPayrollProof(paymentId: string): Promise<string | null> {
  const { companyId } = await requirePayrollManager();
  const row = await withTenant(companyId, (tx) =>
    tx.payrollPayment.findFirst({ where: { id: paymentId, companyId }, select: { proofDataUrl: true } })
  );
  return row?.proofDataUrl ?? null;
}

export async function savePayrollEmployee(input: unknown, id?: string): Promise<ActionResult> {
  const { companyId } = await requirePayrollManager();
  const parsed = EmployeeSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const data = {
    name: parsed.data.name,
    nationalId: parsed.data.nationalId || null,
    position: parsed.data.position || null,
    baseCents: parsed.data.baseCents,
    foodBonusCents: parsed.data.foodBonusCents,
  };
  await withTenant(companyId, async (tx) => {
    if (id) await tx.payrollEmployee.updateMany({ where: { id, companyId }, data });
    else await tx.payrollEmployee.create({ data: { ...data, companyId } });
  });
  revalidatePath("/payroll");
  return { success: true };
}

export async function setPayrollEmployeeActive(id: string, active: boolean): Promise<ActionResult> {
  const { companyId } = await requirePayrollManager();
  await withTenant(companyId, (tx) => tx.payrollEmployee.updateMany({ where: { id, companyId }, data: { active } }));
  revalidatePath("/payroll");
  return { success: true };
}

const PaySchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().refine(isValidPeriod, "Quincena inválida"),
  advanceCents: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER", "ZELLE", "BINANCE", "PAYPAL", "POS", "TRANSFER"]),
  reference: z.string().trim().optional(),
  proofDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "El comprobante debe ser una imagen")
    .max(2_500_000, "El comprobante es demasiado grande")
    .optional(),
});

// Registrar el pago de la quincena a un empleado: guarda el pago con su método,
// referencia y comprobante, y lo anota como gasto de Nómina en Finanzas.
export async function payPayroll(input: unknown): Promise<ActionResult> {
  const session = await requirePayrollManager();
  const { companyId, userId } = session;
  const parsed = PaySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  if (d.paymentMethod !== "CASH" && !d.reference) {
    return { success: false, error: "Escribe la referencia del pago" };
  }

  try {
    await withTenant(companyId, async (tx) => {
      const employee = await tx.payrollEmployee.findFirst({ where: { id: d.employeeId, companyId, active: true } });
      if (!employee) throw new Error("Empleado no encontrado");
      const calc = computeFortnight(employee.baseCents, employee.foodBonusCents, d.advanceCents);
      const expense = await tx.expense.create({
        data: {
          companyId,
          description: `Nómina ${employee.name} · ${d.period}`,
          category: "Nómina",
          amountCents: calc.netCents,
          createdById: userId,
        },
      });
      await tx.payrollPayment.create({
        data: {
          companyId,
          employeeId: employee.id,
          period: d.period,
          grossCents: calc.grossCents,
          deductionsCents: calc.deductionsCents,
          advanceCents: calc.advanceCents,
          netCents: calc.netCents,
          paymentMethod: d.paymentMethod,
          reference: d.reference || null,
          proofDataUrl: d.proofDataUrl ?? null,
          expenseId: expense.id,
          paidById: userId,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "Esa quincena ya está pagada a este empleado." };
    }
    return { success: false, error: err instanceof Error ? err.message : "No se pudo registrar el pago" };
  }
  revalidatePath("/payroll");
  revalidatePath("/finance");
  return { success: true };
}

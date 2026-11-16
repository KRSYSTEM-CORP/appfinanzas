"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAccountingPlan } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { methodForAccountKind, refToAccountCents } from "@/lib/account-money";
import { commissionFor, computeFortnight, isValidPeriod, payrollSettlement, periodDateRange, type PayrollRates } from "@/lib/payroll";
import { dayBoundsUtc, zonedDateStringToUtc } from "@/lib/report-types";
import type { ActionResult } from "@/lib/types";
import type { PaymentMethod, Prisma } from "@prisma/client";

const EmployeeSchema = z.object({
  name: z.string().trim().min(2, "El nombre es obligatorio"),
  nationalId: z.string().trim().optional(),
  position: z.string().trim().optional(),
  baseCents: z.number().int().min(1, "El sueldo base debe ser mayor a 0"),
  foodBonusCents: z.number().int().min(0, "El bono no puede ser negativo").default(0),
  commissionPct: z.number().min(0, "La comisión no puede ser negativa").max(100, "Máximo 100 %").default(0),
  userId: z.string().trim().optional(),
});

export type PayrollEmployeeRow = {
  id: string;
  name: string;
  nationalId: string | null;
  position: string | null;
  baseCents: number;
  foodBonusCents: number;
  commissionPct: number;
  userId: string | null;
  // Comisión estimada de la quincena en curso (según lo que ya vendió).
  commissionCentsNow: number;
  active: boolean;
};

export type PayrollSeller = { id: string; name: string };

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
  commissionCents: number;
  netCents: number;
  // Lo desembolsado en este pago y si fue un adelanto.
  paidCents: number;
  isAdvance: boolean;
  paymentMethod: PaymentMethod;
  reference: string | null;
  accountLabel: string | null;
  note: string | null;
  hasProof: boolean;
  paidAt: Date;
};

// Estado de una quincena por empleado: devengado, pagado y lo que falta (o adelanto).
export type PayrollLedgerRow = {
  employeeId: string;
  employeeName: string;
  period: string;
  owedCents: number;
  paidCents: number;
  advancePaidCents: number;
  pendingCents: number;
  surplusCents: number;
  payments: number;
};

// Total vendido (sin ventas anuladas) por un usuario en una quincena.
async function salesTotalForPeriod(
  tx: Prisma.TransactionClient,
  companyId: string,
  userId: string,
  period: string
): Promise<number> {
  const { from, to } = periodDateRange(period);
  const start = dayBoundsUtc(from).start;
  const end = dayBoundsUtc(to).end;
  const agg = await tx.sale.aggregate({
    where: { companyId, sellerId: userId, voided: false, createdAt: { gte: start, lt: end } },
    _sum: { totalCents: true },
  });
  return agg._sum.totalCents ?? 0;
}

async function requirePayrollManager() {
  // Contabilidad (Pyme y Corporativo) y solo gerente.
  const session = await requireAccountingPlan();
  if (session.role !== "GERENTE" && !session.isSuperAdmin) throw new Error("Solo el gerente puede gestionar la nómina");
  return session;
}

export async function listPayroll(currentPeriod?: string): Promise<{
  employees: PayrollEmployeeRow[];
  payments: PayrollPaymentRow[];
  rates: PayrollRates;
  sellers: PayrollSeller[];
  ledger: PayrollLedgerRow[];
}> {
  const { companyId } = await requirePayrollManager();
  return withTenant(companyId, async (tx) => {
    const [employees, payments, company, users] = await Promise.all([
      tx.payrollEmployee.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
      tx.payrollPayment.findMany({
        where: { companyId },
        orderBy: { paidAt: "desc" },
        take: 300,
        include: {
          employee: { select: { name: true, nationalId: true, position: true } },
          paymentAccount: { select: { bankName: true, accountNumber: true, kind: true } },
        },
      }),
      tx.company.findUnique({
        where: { id: companyId },
        select: { payrollIvssPct: true, payrollParoPct: true, payrollFaovPct: true },
      }),
      tx.user.findMany({
        where: { companyId, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const commissionNow = new Map<string, number>();
    if (currentPeriod && isValidPeriod(currentPeriod)) {
      for (const e of employees) {
        if (e.userId && e.commissionPct > 0) {
          const sold = await salesTotalForPeriod(tx, companyId, e.userId, currentPeriod);
          commissionNow.set(e.id, commissionFor(sold, e.commissionPct));
        }
      }
    }
    // Estado por empleado y quincena. Lo devengado sale del último pago de esa quincena; para la
    // quincena en curso se recalcula con lo vendido hasta hoy.
    const rates: PayrollRates = {
      ivssPct: company?.payrollIvssPct ?? 4,
      paroPct: company?.payrollParoPct ?? 0.5,
      faovPct: company?.payrollFaovPct ?? 1,
    };
    const ledgerMap = new Map<string, PayrollLedgerRow & { latest: number }>();
    for (const p of payments) {
      const key = `${p.employeeId}|${p.period}`;
      const cur = ledgerMap.get(key) ?? {
        employeeId: p.employeeId, employeeName: p.employee.name, period: p.period,
        owedCents: p.netCents, paidCents: 0, advancePaidCents: 0, pendingCents: 0, surplusCents: 0, payments: 0, latest: 0,
      };
      cur.paidCents += p.paidCents;
      if (p.isAdvance) cur.advancePaidCents += p.paidCents;
      cur.payments += 1;
      if (p.paidAt.getTime() >= cur.latest) {
        cur.latest = p.paidAt.getTime();
        cur.owedCents = p.netCents;
      }
      ledgerMap.set(key, cur);
    }
    if (currentPeriod && isValidPeriod(currentPeriod)) {
      for (const e of employees.filter((x) => x.active)) {
        const key = `${e.id}|${currentPeriod}`;
        const owed = computeFortnight(e.baseCents, e.foodBonusCents, 0, rates, commissionNow.get(e.id) ?? 0).netCents;
        const cur = ledgerMap.get(key) ?? {
          employeeId: e.id, employeeName: e.name, period: currentPeriod,
          owedCents: owed, paidCents: 0, advancePaidCents: 0, pendingCents: 0, surplusCents: 0, payments: 0, latest: 0,
        };
        cur.owedCents = owed;
        ledgerMap.set(key, cur);
      }
    }
    const ledger: PayrollLedgerRow[] = [...ledgerMap.values()]
      .map(({ latest: _latest, ...r }) => {
        void _latest;
        const st = payrollSettlement(r.owedCents, r.paidCents);
        return { ...r, pendingCents: st.pendingCents, surplusCents: st.advanceCents };
      })
      .sort((a, b) => (a.period === b.period ? a.employeeName.localeCompare(b.employeeName) : a.period < b.period ? 1 : -1));
    return {
      ledger,
      sellers: users.map((u) => ({
        id: u.id,
        name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email,
      })),
      rates,
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        nationalId: e.nationalId,
        position: e.position,
        baseCents: e.baseCents,
        foodBonusCents: e.foodBonusCents,
        commissionPct: e.commissionPct,
        userId: e.userId,
        commissionCentsNow: commissionNow.get(e.id) ?? 0,
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
        commissionCents: p.commissionCents,
        netCents: p.netCents,
        paidCents: p.paidCents,
        isAdvance: p.isAdvance,
        paymentMethod: p.paymentMethod,
        reference: p.reference,
        accountLabel: p.paymentAccount ? [p.paymentAccount.bankName ?? p.paymentAccount.kind, p.paymentAccount.accountNumber].filter(Boolean).join(" · ") : null,
        note: p.note,
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
    commissionPct: parsed.data.commissionPct,
    userId: parsed.data.userId || null,
  };
  await withTenant(companyId, async (tx) => {
    if (data.userId) {
      const user = await tx.user.findFirst({ where: { id: data.userId, companyId }, select: { id: true } });
      if (!user) throw new Error("El usuario elegido no pertenece a tu empresa");
    }
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
  // Lo que se paga ahora, en la moneda referencial: lo decide el gerente (puede ser parcial).
  amountCents: z.number().int().min(1, "El monto a pagar debe ser mayor a 0").max(1_000_000_000),
  isAdvance: z.boolean().default(false),
  // Día en que se paga (no todos cobran el mismo día): AAAA-MM-DD.
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha del pago"),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER", "ZELLE", "BINANCE", "PAYPAL", "POS", "TRANSFER"]),
  paymentAccountId: z.string().trim().max(40).optional(),
  reference: z.string().trim().optional(),
  note: z.string().trim().max(200).optional(),
  proofDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "El comprobante debe ser una imagen")
    .max(2_500_000, "El comprobante es demasiado grande")
    .optional(),
});

// Registra un pago (completo, parcial o adelanto) de una quincena: guarda el monto que el gerente
// decidió, la fecha, la cuenta de origen y la referencia, descuenta de esa cuenta y lo anota
// como gasto de Nómina en Finanzas. Una quincena admite varios pagos.
export async function payPayroll(input: unknown): Promise<ActionResult> {
  const session = await requirePayrollManager();
  const { companyId, userId } = session;
  const parsed = PaySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  if (d.paymentMethod !== "CASH" && !d.reference) {
    return { success: false, error: "Escribe la referencia del pago" };
  }
  const paidAt = new Date(zonedDateStringToUtc(d.paidDate).getTime() + 12 * 3600_000);
  if (Number.isNaN(paidAt.getTime())) return { success: false, error: "Fecha inválida" };

  try {
    await withTenant(companyId, async (tx) => {
      const employee = await tx.payrollEmployee.findFirst({ where: { id: d.employeeId, companyId, active: true } });
      if (!employee) throw new Error("Empleado no encontrado");
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { payrollIvssPct: true, payrollParoPct: true, payrollFaovPct: true, exchangeRate: true, exchangeRateEnabled: true },
      });
      const sold = employee.userId ? await salesTotalForPeriod(tx, companyId, employee.userId, d.period) : 0;
      const calc = computeFortnight(employee.baseCents, employee.foodBonusCents, 0, {
        ivssPct: company?.payrollIvssPct ?? 4,
        paroPct: company?.payrollParoPct ?? 0.5,
        faovPct: company?.payrollFaovPct ?? 1,
      }, commissionFor(sold, employee.commissionPct));

      // Cuenta de origen: debe ser de la empresa; el débito va en la moneda de esa cuenta.
      let accountDebitCents: number | null = null;
      let accountId: string | null = null;
      let method: PaymentMethod = d.paymentMethod;
      if (d.paymentAccountId) {
        const acc = await tx.paymentAccount.findFirst({ where: { id: d.paymentAccountId, companyId }, select: { id: true, currency: true, kind: true } });
        if (!acc) throw new Error("La cuenta elegida no existe");
        accountId = acc.id;
        // El método sale de la cuenta elegida (pago móvil, transferencia, Zelle...): así el pago
        // no queda como «Efectivo» aunque el selector de método no se haya tocado.
        method = methodForAccountKind(acc.kind);
        const rate = company?.exchangeRateEnabled && company.exchangeRate ? Number(company.exchangeRate) : null;
        const debit = refToAccountCents(d.amountCents, acc.currency, rate);
        if (debit == null) throw new Error("Configura la tasa de cambio para pagar desde una cuenta en bolívares");
        accountDebitCents = debit;
      }

      const label = d.isAdvance ? "Adelanto de nómina" : "Nómina";
      const expense = await tx.expense.create({
        data: {
          companyId,
          description: `${label} ${employee.name} · ${d.period}`,
          category: "Nómina",
          amountCents: d.amountCents,
          spentAt: paidAt,
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
          advanceCents: 0,
          commissionCents: calc.commissionCents,
          netCents: calc.netCents,
          paidCents: d.amountCents,
          isAdvance: d.isAdvance,
          paymentMethod: method,
          reference: d.reference || null,
          proofDataUrl: d.proofDataUrl ?? null,
          paymentAccountId: accountId,
          accountDebitCents,
          note: d.note || null,
          expenseId: expense.id,
          paidById: userId,
          paidAt,
        },
      });
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo registrar el pago" };
  }
  revalidatePath("/payroll");
  revalidatePath("/finance");
  revalidatePath("/accounting");
  revalidatePath("/accounting/accounts");
  return { success: true };
}

const RatesSchema = z.object({
  ivssPct: z.number().min(0, "No puede ser negativo").max(30, "Máximo 30 %"),
  paroPct: z.number().min(0, "No puede ser negativo").max(30, "Máximo 30 %"),
  faovPct: z.number().min(0, "No puede ser negativo").max(30, "Máximo 30 %"),
});

export async function savePayrollRates(input: unknown): Promise<ActionResult> {
  const { companyId } = await requirePayrollManager();
  const parsed = RatesSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  await withTenant(companyId, (tx) =>
    tx.company.update({
      where: { id: companyId },
      data: {
        payrollIvssPct: parsed.data.ivssPct,
        payrollParoPct: parsed.data.paroPct,
        payrollFaovPct: parsed.data.faovPct,
      },
    })
  );
  revalidatePath("/payroll");
  return { success: true };
}

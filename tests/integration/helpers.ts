import { vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Owner connection (bypasses RLS) used only to look up fixtures and inspect
// results; the code under test uses the app's own client (DATABASE_URL).
export const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });

export type Ctx = { companyId: string; branchId: string; userId: string; productId: string };

// The seeded test company (prisma/seed-pruebas.ts): its manager, main
// branch and one stock-tracked product with stock to sell.
export async function loadContext(): Promise<Ctx> {
  const company = await owner.company.findFirstOrThrow({ where: { loginCode: "PRUEBA1" } });
  const branch = await owner.branch.findFirstOrThrow({ where: { companyId: company.id, name: "Sucursal Principal" } });
  const user = await owner.user.findFirstOrThrow({ where: { email: "gerente@pruebas.test" } });
  const product = await owner.product.findFirstOrThrow({
    where: { companyId: company.id, branchId: branch.id, trackStock: true, isActive: true, stock: { gte: 20 }, priceTiersEnabled: false },
    orderBy: { stock: "desc" },
  });
  return { companyId: company.id, branchId: branch.id, userId: user.id, productId: product.id };
}

export function sessionFor(ctx: Ctx) {
  return {
    userId: ctx.userId,
    companyId: ctx.companyId,
    companyName: "Comercial Pruebas",
    isSuperAdmin: false,
    billingBlocked: false,
    isExempt: true,
    monthlyFeeUsdCents: null,
    localCurrencyCode: "VES",
    nextPaymentDueDate: null,
    role: "GERENTE" as const,
    sellerName: "Gerente Pruebas",
    allowedSections: [],
    enabledFeatures: [],
    branchId: ctx.branchId,
    branchName: "Sucursal Principal",
    hasSeenTour: true,
  };
}

export const customer = {
  customerFirstName: "Cliente",
  customerLastName: "Integración",
  customerPhone: "04140000001",
  customerAddress: "Valencia",
};

export { vi };

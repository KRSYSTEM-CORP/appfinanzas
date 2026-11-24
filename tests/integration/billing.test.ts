import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

// Same manager of the seeded company, flagged super admin so it can also
// approve its own report (approvePaymentReport requires one).
let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  requireAccountingPlan: async () => sessionFor(ctx),
  hasPermission: () => true,
  getSession: async () => ({ ...sessionFor(ctx), isSuperAdmin: true }),
  requireSession: async () => ({ ...sessionFor(ctx), isSuperAdmin: true }),
  requireManager: async () => ({ ...sessionFor(ctx), isSuperAdmin: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`); } }));
vi.mock("@/lib/email", () => ({ sendPaymentReportEmail: async () => {}, sendAnnouncementEmail: async () => {} }));
vi.mock("@/lib/cache", () => ({ getOrSetCache: async (_k: string, _t: number, f: () => unknown) => f(), invalidateCache: async () => {} }));

const { submitPaymentReport } = await import("@/lib/actions/billing");
const CONTACT = { reporterName: "Ana Pérez", reporterPhone: "0412-555-0000", proofImageDataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" };
const { approvePaymentReport } = await import("@/lib/actions/admin");

let wasExempt = false;
beforeAll(async () => {
  ctx = await loadContext();
  wasExempt = (await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } })).isExempt;
  await owner.company.update({ where: { id: ctx.companyId }, data: { isExempt: false } });
});
afterAll(async () => {
  await owner.company.update({ where: { id: ctx.companyId }, data: { isExempt: wasExempt } });
});

describe("pago de suscripción", () => {
  it("al aprobarlo extiende el vencimiento y no exonera a la empresa", async () => {
    const before = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    const r = await submitPaymentReport({ ...CONTACT, lines: [{ paymentMethod: "BINANCE", amount: 30, reference: "SUB-TEST" }] });
    expect(r.success).toBe(true);
    const report = await owner.paymentReport.findFirstOrThrow({
      where: { companyId: ctx.companyId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    expect((await approvePaymentReport(report.id)).success).toBe(true);
    const company = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    expect(company.isExempt).toBe(false);
    expect(company.nextPaymentDueDate?.getTime() ?? 0).toBeGreaterThanOrEqual(before.nextPaymentDueDate?.getTime() ?? 0);
  });
});

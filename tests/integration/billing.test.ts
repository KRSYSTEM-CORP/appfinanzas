import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

// Same manager of the seeded company, flagged super admin so it can also
// approve its own report (approvePaymentReport requires one).
let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ ...sessionFor(ctx), isSuperAdmin: true }),
  requireSession: async () => ({ ...sessionFor(ctx), isSuperAdmin: true }),
  requireManager: async () => ({ ...sessionFor(ctx), isSuperAdmin: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`); } }));
vi.mock("@/lib/email", () => ({ sendPaymentReportEmail: async () => {}, sendAnnouncementEmail: async () => {} }));
vi.mock("@/lib/cache", () => ({ getOrSetCache: async (_k: string, _t: number, f: () => unknown) => f(), invalidateCache: async () => {} }));

const { submitPaymentReport } = await import("@/lib/actions/billing");
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

describe("pago único de por vida", () => {
  it("rechaza reportar menos del precio", async () => {
    const r = await submitPaymentReport({ lifetime: true, lines: [{ paymentMethod: "BINANCE", amount: 100, reference: "X1" }] });
    expect(r.success).toBe(false);
  });

  it("al aprobarlo, la empresa queda exonerada de las mensualidades", async () => {
    const r = await submitPaymentReport({ lifetime: true, lines: [{ paymentMethod: "BINANCE", amount: 240, reference: "LIFE-TEST" }] });
    expect(r.success).toBe(true);
    const report = await owner.paymentReport.findFirstOrThrow({
      where: { companyId: ctx.companyId, isLifetime: true, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    expect((await approvePaymentReport(report.id)).success).toBe(true);
    const company = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    expect(company.isExempt).toBe(true);
  });
});

import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ ...sessionFor(ctx), plan: "PYME" }),
  requireSession: async () => ({ ...sessionFor(ctx), plan: "PYME" }),
  requireManager: async () => ({ ...sessionFor(ctx), plan: "PYME" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { getPlanUsage } = await import("@/lib/actions/plan");

beforeAll(async () => {
  ctx = await loadContext();
});

describe("Mi plan: uso de límites", () => {
  it("trae el plan de la sesión y los mismos conteos que la base", async () => {
    const usage = await getPlanUsage();
    expect(usage.plan.id).toBe("PYME");
    expect(usage.plan.maxUsers).toBe(5);

    const users = await owner.user.count({ where: { companyId: ctx.companyId, status: "ACTIVE" } });
    const products = await owner.product.count({ where: { companyId: ctx.companyId } });
    expect(usage.usedUsers).toBe(users);
    expect(usage.usedProducts).toBe(products);
    expect(usage.creditsLeft).toBeGreaterThanOrEqual(0);
  });
});

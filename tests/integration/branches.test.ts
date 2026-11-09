import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";
import { hashPassword } from "@/lib/password";

let ctx: Ctx;
const setCookie = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getSession: async () => sessionFor(ctx),
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
  setSessionCookie: (p: unknown) => setCookie(p),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/cache", () => ({ getOrSetCache: async (_k: string, _t: number, f: () => unknown) => f(), invalidateCache: async () => {} }));

const { enterBranch, branchOverview } = await import("@/lib/actions/branches");

const PASSWORD = "Clave-De-Prueba-9";
let otherBranchId = "";
let originalHash: string | null = null;

beforeAll(async () => {
  ctx = await loadContext();
  const user = await owner.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  originalHash = user.passwordHash;
  await owner.user.update({ where: { id: ctx.userId }, data: { passwordHash: hashPassword(PASSWORD) } });
  const other = await owner.branch.upsert({
    where: { companyId_name: { companyId: ctx.companyId, name: "Sede de prueba clave" } },
    update: { isActive: true },
    create: { companyId: ctx.companyId, name: "Sede de prueba clave" },
  });
  otherBranchId = other.id;
  await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "branch-enter:" } } });
});

afterAll(async () => {
  await owner.user.update({ where: { id: ctx.userId }, data: { passwordHash: originalHash } });
  await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "branch-enter:" } } });
  await owner.branch.deleteMany({ where: { id: otherBranchId } });
});

describe("entrar a una sede con clave", () => {
  it("rechaza una clave incorrecta y no cambia la sesión", async () => {
    setCookie.mockClear();
    const r = await enterBranch(otherBranchId, "otra-clave");
    expect(r.success).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("con la clave correcta cambia de sede", async () => {
    setCookie.mockClear();
    const r = await enterBranch(otherBranchId, PASSWORD);
    expect(r.success).toBe(true);
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ bid: otherBranchId }));
  });

  it("no deja entrar a una sucursal de otra empresa o inexistente", async () => {
    const r = await enterBranch("no-existe", PASSWORD);
    expect(r.success).toBe(false);
  });

  it("bloquea tras 5 claves incorrectas seguidas", async () => {
    await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "branch-enter:" } } });
    for (let i = 0; i < 5; i++) await enterBranch(otherBranchId, "mala");
    const r = await enterBranch(otherBranchId, PASSWORD);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Demasiados intentos/);
  });
});

describe("resumen de sucursales", () => {
  it("lista las sedes de la empresa con sus conteos", async () => {
    const { summaries } = await branchOverview();
    const main = summaries.find((s) => s.id === ctx.branchId);
    expect(main).toBeDefined();
    expect(main!.products).toBeGreaterThan(0);
    expect(summaries.some((s) => s.id === otherBranchId)).toBe(true);
  });
});

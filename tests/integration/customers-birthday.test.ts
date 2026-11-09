import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getSession: async () => sessionFor(ctx),
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
  requireSectionAccess: async () => sessionFor(ctx),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createCustomer, updateCustomer, listUpcomingBirthdays } = await import("@/lib/actions/customers");

const PHONE = "04149990001";
const form = (birthDate: string) => {
  const f = new FormData();
  f.set("firstName", "Cumple");
  f.set("lastName", "Prueba");
  f.set("phone", PHONE);
  f.set("address", "Valencia");
  f.set("rif", "");
  f.set("birthDate", birthDate);
  return f;
};

// Cumpleaños dentro de 3 días, en año pasado (formato AAAA-MM-DD).
function inDays(n: number, year = 1990): string {
  const d = new Date(Date.now() + n * 86_400_000 - 4 * 3600_000); // día de Venezuela
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

beforeAll(async () => {
  ctx = await loadContext();
  await owner.customer.deleteMany({ where: { companyId: ctx.companyId, phone: PHONE } });
});
afterAll(async () => {
  await owner.customer.deleteMany({ where: { companyId: ctx.companyId, phone: PHONE } });
});

describe("cumpleaños de clientes", () => {
  it("guarda la fecha y el cliente aparece en los próximos cumpleaños", async () => {
    expect((await createCustomer(form(inDays(3)))).success).toBe(true);
    const list = await listUpcomingBirthdays(30);
    const mine = list.find((b) => b.phone === PHONE);
    expect(mine).toBeDefined();
    expect(mine!.inDays).toBe(3);
  });

  it("rechaza fechas futuras o anteriores a 1900", async () => {
    const c = await owner.customer.findFirstOrThrow({ where: { companyId: ctx.companyId, phone: PHONE } });
    expect((await updateCustomer(c.id, form("2999-01-01"))).success).toBe(false);
    expect((await updateCustomer(c.id, form("1850-05-05"))).success).toBe(false);
  });

  it("dejar la fecha vacía la borra", async () => {
    const c = await owner.customer.findFirstOrThrow({ where: { companyId: ctx.companyId, phone: PHONE } });
    expect((await updateCustomer(c.id, form(""))).success).toBe(true);
    const list = await listUpcomingBirthdays(366);
    expect(list.find((b) => b.phone === PHONE)).toBeUndefined();
  });
});

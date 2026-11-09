import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
let lockedMode = false;
let actingUserId = "";
const setCookie = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => {
  const base = () => ({ ...sessionFor(ctx), userId: actingUserId || sessionFor(ctx).userId, hasPin: true });
  return {
    getSession: async () => ({ ...base(), locked: lockedMode }),
    requireSession: async () => ({ ...base(), locked: false }),
    requireManager: async () => ({ ...base(), locked: false }),
    setSessionCookie: (p: unknown) => setCookie(p),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.stubEnv("AUTH_SECRET", "secreto-de-pruebas-de-integracion");
const { setUserPin, lockSession, unlockWithPin, listLockProfiles } = await import("@/lib/actions/pin");

const SELLER_EMAIL = "vendedor-pin@pruebas.test";
let sellerId = "";

beforeAll(async () => {
  ctx = await loadContext();
  await owner.user.deleteMany({ where: { email: SELLER_EMAIL } });
  const seller = await owner.user.create({
    data: { email: SELLER_EMAIL, companyId: ctx.companyId, role: "VENDEDOR", branchId: ctx.branchId, firstName: "Vera", lastName: "Pin" },
  });
  sellerId = seller.id;
  await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "pin-unlock" } } });
});

afterAll(async () => {
  await owner.user.update({ where: { id: ctx.userId }, data: { pinHash: null, pinKey: null } });
  await owner.user.deleteMany({ where: { email: SELLER_EMAIL } });
  await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "pin-unlock" } } });
});

describe("PIN por persona", () => {
  it("rechaza PIN triviales o mal formados", async () => {
    expect((await setUserPin(sellerId, "1234")).success).toBe(false);
    expect((await setUserPin(sellerId, "0000")).success).toBe(false);
    expect((await setUserPin(sellerId, "12ab")).success).toBe(false);
  });

  it("guarda el PIN (solo como hash) y no se puede repetir en la empresa", async () => {
    expect((await setUserPin(sellerId, "4827")).success).toBe(true);
    const u = await owner.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(u.pinHash).toBeTruthy();
    expect(u.pinHash).not.toContain("4827");
    const dup = await setUserPin(ctx.userId, "4827");
    expect(dup.success).toBe(false);
    if (!dup.success) expect(dup.error).toMatch(/ya lo usa/);
    expect((await setUserPin(ctx.userId, "905163")).success).toBe(true);
  });

  it("no toca a personas de otra empresa", async () => {
    expect((await setUserPin("no-existe", "6159")).success).toBe(false);
  });
});

describe("bloquear y desbloquear", () => {
  it("bloquear marca la cookie como bloqueada", async () => {
    setCookie.mockClear();
    actingUserId = ctx.userId;
    expect((await lockSession()).success).toBe(true);
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ uid: ctx.userId, lk: true }));
  });

  it("solo entrega los perfiles cuando está bloqueada", async () => {
    lockedMode = false;
    expect(await listLockProfiles()).toEqual([]);
    lockedMode = true;
    const profiles = await listLockProfiles();
    expect(profiles.map((p) => p.id).sort()).toEqual([ctx.userId, sellerId].sort());
    expect(JSON.stringify(profiles)).not.toMatch(/pinHash|pinKey|passwordHash/);
  });

  it("PIN incorrecto no desbloquea; el correcto entra como esa persona", async () => {
    lockedMode = true;
    setCookie.mockClear();
    expect((await unlockWithPin(sellerId, "9999")).success).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
    expect((await unlockWithPin(sellerId, "4827")).success).toBe(true);
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ uid: sellerId, lk: false }));
  });

  it("el PIN de otra persona no abre este perfil", async () => {
    setCookie.mockClear();
    expect((await unlockWithPin(sellerId, "905163")).success).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("bloquea tras 5 PIN incorrectos seguidos aunque el sexto sea correcto", async () => {
    await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "pin-unlock" } } });
    for (let i = 0; i < 5; i++) await unlockWithPin(sellerId, "1357");
    const r = await unlockWithPin(sellerId, "4827");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Demasiados intentos/);
  });

  it("quitar el PIN deja a esa persona fuera de la pantalla de bloqueo", async () => {
    lockedMode = false;
    expect((await setUserPin(sellerId, null)).success).toBe(true);
    lockedMode = true;
    const ids = (await listLockProfiles()).map((p) => p.id);
    expect(ids).not.toContain(sellerId);
  });
});

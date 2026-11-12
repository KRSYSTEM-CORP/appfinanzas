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
const { setUserPin, lockSession, unlockWithPin, listLockProfiles, createFirstManagerPin } = await import("@/lib/actions/pin");
const { createEmployee } = await import("@/lib/actions/employees");

const SELLER_EMAIL = "vendedor-pin@pruebas.test";
let sellerId = "";

beforeAll(async () => {
  ctx = await loadContext();
  // Partir sin PIN en la empresa de pruebas (puede haber PIN de otras pruebas a mano).
  await owner.user.updateMany({ where: { companyId: ctx.companyId }, data: { pinHash: null, pinKey: null } });
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

  it("primero el gerente: nadie más recibe PIN hasta que un gerente tenga el suyo", async () => {
    const early = await setUserPin(sellerId, "4827");
    expect(early.success).toBe(false);
    if (!early.success) expect(early.error).toMatch(/Primero crea el PIN de un gerente/);
    expect((await setUserPin(ctx.userId, "9051")).success).toBe(true);
  });

  it("no se crean perfiles nuevos mientras ningún gerente tenga PIN", async () => {
    await owner.user.update({ where: { id: ctx.userId }, data: { pinHash: null, pinKey: null } });
    const fd = new FormData();
    fd.set("firstName", "Nueva");
    fd.set("lastName", "Persona");
    fd.set("pin", "7316");
    fd.set("role", "VENDEDOR");
    fd.set("branchId", ctx.branchId);
    const r = await createEmployee(fd);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Primero crea tu propio PIN/);
    expect((await setUserPin(ctx.userId, "9051")).success).toBe(true);
  });

  it("guarda el PIN (solo como hash) y no se puede repetir en la empresa", async () => {
    expect((await setUserPin(sellerId, "4827")).success).toBe(true);
    const u = await owner.user.findUniqueOrThrow({ where: { id: sellerId } });
    expect(u.pinHash).toBeTruthy();
    expect(u.pinHash).not.toContain("4827");
    const dup = await setUserPin(ctx.userId, "4827");
    expect(dup.success).toBe(false);
    if (!dup.success) expect(dup.error).toMatch(/ya lo usa/);
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
    const ids = profiles.map((p) => p.id);
    expect(ids).toContain(ctx.userId);
    expect(ids).toContain(sellerId);
    expect(profiles.find((p) => p.id === sellerId)?.access).toBe("pin");
    expect(JSON.stringify(profiles)).not.toMatch(/pinHash|pinKey|passwordHash/);
  });

  it("PIN incorrecto no desbloquea; el correcto entra como esa persona", async () => {
    lockedMode = true;
    setCookie.mockClear();
    expect((await unlockWithPin(sellerId, "9999")).success).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
    const ok = await unlockWithPin(sellerId, "4827");
    expect(ok.success).toBe(true);
    expect(ok.success && ok.redirectTo).toBe("/pos");
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ uid: sellerId, lk: false }));
  });

  it("el PIN de otra persona no abre este perfil", async () => {
    setCookie.mockClear();
    expect((await unlockWithPin(sellerId, "9051")).success).toBe(false);
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("bloquea tras 5 PIN incorrectos seguidos aunque el sexto sea correcto", async () => {
    await owner.loginAttempt.deleteMany({ where: { key: { startsWith: "pin-unlock" } } });
    for (let i = 0; i < 5; i++) await unlockWithPin(sellerId, "1357");
    const r = await unlockWithPin(sellerId, "4827");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/Demasiados intentos/);
  });

  it("quitar el PIN deja a esa persona en «pídelo a tu gerente», pero la sigue mostrando", async () => {
    lockedMode = false;
    expect((await setUserPin(sellerId, null)).success).toBe(true);
    lockedMode = true;
    const seller = (await listLockProfiles()).find((p) => p.id === sellerId);
    expect(seller?.access).toBe("ask-manager");
    expect(seller?.managerPinReady).toBe(true);
  });
});

describe("primer PIN de gerente en empresas existentes", () => {
  it("sin ningún PIN: el gerente puede crearlo y el vendedor queda esperando al gerente", async () => {
    await owner.user.updateMany({ where: { companyId: ctx.companyId }, data: { pinHash: null, pinKey: null } });
    lockedMode = true;
    const profiles = await listLockProfiles();
    expect(profiles.find((p) => p.id === ctx.userId)?.access).toBe("create");
    const seller = profiles.find((p) => p.id === sellerId);
    expect(seller?.access).toBe("ask-manager");
    expect(seller?.managerPinReady).toBe(false);
  });

  it("el vendedor no puede crear su PIN por esta vía", async () => {
    const r = await createFirstManagerPin(sellerId, "6159", "6159");
    expect(r.success).toBe(false);
  });

  it("rechaza si los dos PIN no coinciden o es débil", async () => {
    expect((await createFirstManagerPin(ctx.userId, "6159", "6150")).success).toBe(false);
    expect((await createFirstManagerPin(ctx.userId, "1234", "1234")).success).toBe(false);
  });

  it("el gerente crea su PIN, entra y desde ahí el resto ya depende de él", async () => {
    setCookie.mockClear();
    const r = await createFirstManagerPin(ctx.userId, "6159", "6159");
    expect(r.success).toBe(true);
    expect(r.success && r.redirectTo).toBe("/home");
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({ uid: ctx.userId, lk: false }));
    // Ya hay un gerente con PIN: no se puede crear otro «primer PIN» por esta vía.
    expect((await createFirstManagerPin(ctx.userId, "7391", "7391")).success).toBe(false);
    lockedMode = false;
    expect((await setUserPin(sellerId, "4827")).success).toBe(true);
  });

  it("no se puede quitar el único PIN de gerente mientras otros dependen de él", async () => {
    const r = await setUserPin(ctx.userId, null);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/único PIN de gerente/);
  });
});

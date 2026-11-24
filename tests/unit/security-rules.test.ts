import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

// BD en memoria mínima para loginAttempt.
const rows: { id: number; key: string; createdAt: Date }[] = [];
let seq = 0;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    loginAttempt: {
      create: async ({ data }: { data: { key: string } }) => {
        const row = { id: ++seq, key: data.key, createdAt: new Date() };
        rows.push(row);
        return { id: row.id };
      },
      count: async ({ where }: { where: { key: string; createdAt: { gte: Date } } }) =>
        rows.filter((r) => r.key === where.key && r.createdAt >= where.createdAt.gte).length,
      delete: async ({ where }: { where: { id: number } }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        if (i >= 0) rows.splice(i, 1);
      },
    },
  },
}));

import { consumeAttempt } from "@/lib/rate-limit";
import { pickClientIp } from "@/lib/request-ip";
import { canAdministerRoles } from "@/lib/permissions";

describe("consumeAttempt", () => {
  it("con peticiones en paralelo deja pasar como máximo el tope", async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => consumeAttempt("pin", "u1", 5, 60_000)));
    expect(results.filter((r) => r.allowed).length).toBeLessThanOrEqual(5);
  });
});

describe("pickClientIp", () => {
  it("prefiere x-real-ip", () => expect(pickClientIp("1.1.1.1", "9.9.9.9, 2.2.2.2")).toBe("1.1.1.1"));
  it("usa el último salto de x-forwarded-for, no el que manda el cliente", () =>
    expect(pickClientIp(null, "6.6.6.6, 3.3.3.3")).toBe("3.3.3.3"));
  it("sin cabeceras devuelve unknown", () => expect(pickClientIp(null, null)).toBe("unknown"));
});

describe("canAdministerRoles", () => {
  it("el vendedor con permiso de ajustes no administra roles", () =>
    expect(canAdministerRoles({ role: "VENDEDOR" })).toBe(false));
  it("el gerente y el superadmin sí", () => {
    expect(canAdministerRoles({ role: "GERENTE" })).toBe(true);
    expect(canAdministerRoles({ role: "VENDEDOR", isSuperAdmin: true })).toBe(true);
  });
});

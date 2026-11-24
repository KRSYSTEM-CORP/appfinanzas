import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { signBranchTicket, verifyBranchTicket } from "@/lib/branch-ticket";

beforeAll(() => {
  process.env.AUTH_SECRET = "secreto-de-prueba";
});

describe("permiso para elegir sucursal", () => {
  it("se verifica dentro de los 5 minutos y devuelve usuario y empresa", () => {
    const t = signBranchTicket("u1", "c1", 1_000_000);
    expect(verifyBranchTicket(t, 1_000_000 + 4 * 60_000)).toEqual({ userId: "u1", companyId: "c1" });
  });
  it("vence a los 5 minutos", () => {
    const t = signBranchTicket("u1", "c1", 1_000_000);
    expect(verifyBranchTicket(t, 1_000_000 + 5 * 60_000 + 1)).toBeNull();
  });
  it("rechaza un permiso alterado o de otra firma", () => {
    const t = signBranchTicket("u1", "c1", 1_000_000);
    const [data, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "otro", c: "c1", e: 9_999_999_999_999, p: "branch" })).toString("base64url");
    expect(verifyBranchTicket(`${forged}.${sig}`, 1_000_001)).toBeNull();
    expect(verifyBranchTicket(`${data}.${sig.slice(0, -2)}xx`, 1_000_001)).toBeNull();
    expect(verifyBranchTicket("basura", 1_000_001)).toBeNull();
    expect(verifyBranchTicket("", 1_000_001)).toBeNull();
  });
});

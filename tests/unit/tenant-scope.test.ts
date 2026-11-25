import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const transactions: string[] = [];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      transactions.push("tx");
      return fn({ $executeRaw: async () => 1, id: transactions.length });
    },
  },
}));

import { scopeMemo, withTenant, withTenantScope } from "@/lib/tenant-db";

describe("withTenantScope", () => {
  it("reutiliza una sola transacción para la misma empresa", async () => {
    transactions.length = 0;
    const seen = await withTenantScope("c1", () =>
      Promise.all([withTenant("c1", async (tx) => (tx as unknown as { id: number }).id), withTenant("c1", async (tx) => (tx as unknown as { id: number }).id)])
    );
    expect(transactions).toHaveLength(1);
    expect(seen[0]).toBe(seen[1]);
  });

  it("otra empresa dentro del scope abre su propia transacción (RLS)", async () => {
    transactions.length = 0;
    await withTenantScope("c1", () => withTenant("c2", async () => 1));
    expect(transactions).toHaveLength(2);
  });

  it("sin scope cada withTenant abre la suya y scopeMemo no memoriza", async () => {
    transactions.length = 0;
    await withTenant("c1", async () => 1);
    await withTenant("c1", async () => 1);
    expect(transactions).toHaveLength(2);
    let n = 0;
    await scopeMemo("k", async () => ++n);
    await scopeMemo("k", async () => ++n);
    expect(n).toBe(2);
  });

  it("dentro del scope scopeMemo ejecuta una sola vez", async () => {
    let n = 0;
    await withTenantScope("c1", async () => {
      await scopeMemo("k", async () => ++n);
      await scopeMemo("k", async () => ++n);
    });
    expect(n).toBe(1);
  });
});

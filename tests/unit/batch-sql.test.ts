import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));

import { bq, jsDate, jsDateOnly } from "@/lib/batch-sql";

type Fake = { calls: Prisma.Sql[]; $queryRaw: (sql: Prisma.Sql) => Promise<Record<string, unknown>[]> };

// Simula la base: cada subconsulta r{i} devuelve las filas que el test le asigne.
function fakeTx(results: Record<string, unknown>[][], fail = false): Fake {
  const calls: Prisma.Sql[] = [];
  return {
    calls,
    $queryRaw: async (sql: Prisma.Sql) => {
      calls.push(sql);
      if (fail) throw new Error("falla de consulta");
      const row: Record<string, unknown> = {};
      results.forEach((r, i) => (row[`r${i}`] = r));
      return [row];
    },
  };
}

describe("bq: lecturas agrupadas", () => {
  it("las consultas del mismo turno viajan en una sola sentencia y cada una recibe sus filas", async () => {
    const tx = fakeTx([[{ n: 1 }], [{ n: 2 }, { n: 3 }], []]);
    const [a, b, c] = await Promise.all([
      bq<{ n: number }>(tx as never)`SELECT 1 AS n WHERE ${"x"} = ${"x"}`,
      bq<{ n: number }>(tx as never)`SELECT 2 AS n`,
      bq<{ n: number }>(tx as never)`SELECT 3 AS n WHERE false`,
    ]);
    expect(tx.calls).toHaveLength(1);
    expect(a).toEqual([{ n: 1 }]);
    expect(b).toEqual([{ n: 2 }, { n: 3 }]);
    expect(c).toEqual([]);
    // Cada consulta original va dentro de una subconsulta numerada y conserva sus parámetros.
    expect(tx.calls[0].sql).toContain("AS r0");
    expect(tx.calls[0].sql).toContain("AS r2");
    expect(tx.calls[0].values).toEqual(["x", "x"]);
  });

  it("un turno posterior abre otra sentencia (dependencia entre lecturas)", async () => {
    const tx = fakeTx([[{ n: 1 }]]);
    await bq(tx as never)`SELECT 1`;
    await bq(tx as never)`SELECT 2`;
    expect(tx.calls).toHaveLength(2);
  });

  it("transacciones distintas nunca se mezclan (RLS)", async () => {
    const t1 = fakeTx([[{ a: 1 }]]);
    const t2 = fakeTx([[{ a: 2 }]]);
    const [r1, r2] = await Promise.all([bq(t1 as never)`SELECT 1`, bq(t2 as never)`SELECT 2`]);
    expect(t1.calls).toHaveLength(1);
    expect(t2.calls).toHaveLength(1);
    expect(r1).toEqual([{ a: 1 }]);
    expect(r2).toEqual([{ a: 2 }]);
  });

  it("si la sentencia falla, todas las lecturas del grupo rechazan", async () => {
    const tx = fakeTx([], true);
    const rs = await Promise.allSettled([bq(tx as never)`SELECT 1`, bq(tx as never)`SELECT 2`]);
    expect(rs.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });
});

describe("fechas del JSON", () => {
  it("un timestamp sin zona se lee como UTC y uno con zona conserva su desfase", () => {
    expect(jsDate("2026-11-25T10:30:00.123").toISOString()).toBe("2026-11-25T10:30:00.123Z");
    expect(jsDate("2026-11-25T10:30:00+00:00").toISOString()).toBe("2026-11-25T10:30:00.000Z");
    expect(jsDate("2026-11-25T06:30:00-04:00").toISOString()).toBe("2026-11-25T10:30:00.000Z");
  });

  it("una fecha date queda en medianoche UTC", () => {
    expect(jsDateOnly("2026-11-25").toISOString()).toBe("2026-11-25T00:00:00.000Z");
  });
});

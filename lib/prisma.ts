import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Pool explícito: sin connectionTimeoutMillis una petición esperaba para siempre si el pool se agotaba,
// y una consulta colgada ocupaba una conexión indefinidamente. Ajustable por entorno.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 10_000),
  idleTimeoutMillis: 30_000,
  statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS ?? 60_000),
});

const debugQueries = process.env.KR_QUERY_LOG === "1";
export const prisma =
  globalForPrisma.prisma ??
  (debugQueries
    ? (() => {
        const c = new PrismaClient({ adapter, log: [{ emit: "event", level: "query" }] });
        (c as unknown as { $on: (e: string, f: (q: { query: string; duration: number }) => void) => void }).$on("query", (q) =>
          console.log(`[Q] ${q.duration}ms ${q.query.replace(/\s+/g, " ").slice(0, Number(process.env.KR_QUERY_LOG_LEN) || 90)}`)
        );
        return c;
      })()
    : new PrismaClient({ adapter }));

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

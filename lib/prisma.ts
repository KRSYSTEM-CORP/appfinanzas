import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

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

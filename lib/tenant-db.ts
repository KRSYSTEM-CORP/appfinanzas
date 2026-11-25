import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Row-Level Security safety net: every tenant-scoped query runs inside a
// transaction that first tags the Postgres session with the caller's
// companyId (via set_config, which is safely parameterized — unlike a raw
// SET LOCAL string). RLS policies on the business tables then only return
// rows matching that company, even if application code ever forgets a
// `where: { companyId }` filter. The explicit filters stay in place anyway
// as a first line of defense; this is the second.
// Every page fires several of these concurrently (e.g. /pos loads products,
// exchange rate, categories, and branding in one Promise.all), and Neon's
// serverless Postgres can take several seconds to wake a suspended compute.
// Prisma's interactive-transaction defaults (2s to acquire, 5s to run) are
// too tight for that cold-start latency and for longer-running loops like
// bulkImportProducts, so both are widened here.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

const scope = new AsyncLocalStorage<{ companyId: string; tx: Prisma.TransactionClient; memo: Map<string, Promise<unknown>> }>();

// Dentro de withTenantScope (una sola lectura de pantalla) repite una consulta idéntica una sola vez.
// Fuera del scope no memoriza nada.
export function scopeMemo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const st = scope.getStore();
  if (!st) return fn();
  let p = st.memo.get(key) as Promise<T> | undefined;
  if (!p) st.memo.set(key, (p = fn()));
  return p;
}

// Una pantalla que lee decenas de agregados independientes abría una transacción por cada uno
// (BEGIN, set_config y COMMIT: 3 viajes de más cada vez). Dentro de withTenantScope todas las
// llamadas a withTenant de la MISMA empresa reutilizan una sola transacción; la seguridad RLS es
// la misma (el set_config de la empresa ya está hecho) y las cifras no cambian.
export function withTenantScope<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  // KR_NO_TENANT_SCOPE=1 apaga el reuso (sirve para comparar cifras antes/después en las pruebas).
  if (process.env.KR_NO_TENANT_SCOPE === "1") return fn();
  return withTenant(companyId, (tx) => scope.run({ companyId, tx, memo: new Map() }, fn));
}

export async function withTenant<T>(
  companyId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const shared = scope.getStore();
  if (shared && shared.companyId === companyId) return fn(shared.tx);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    return fn(tx);
  }, TRANSACTION_OPTIONS);
}

// Used only by lib/actions/admin.ts, after requireSuperAdmin() has already
// verified the caller — grants the RLS escape hatch that lets platform-admin
// queries see every company's rows instead of just one.
export async function withSuperAdmin<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'true', true)`;
    return fn(tx);
  }, TRANSACTION_OPTIONS);
}

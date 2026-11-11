import "server-only";
import type { withTenant } from "@/lib/tenant-db";

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

// Gerentes activos de la empresa que ya tienen PIN (opcionalmente sin contar a uno).
// Regla: hasta que exista al menos uno, nadie más puede recibir su código personal.
export async function countManagersWithPin(tx: Tx, companyId: string, excludeUserId?: string): Promise<number> {
  return tx.user.count({
    where: {
      companyId,
      role: "GERENTE",
      status: "ACTIVE",
      pinHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

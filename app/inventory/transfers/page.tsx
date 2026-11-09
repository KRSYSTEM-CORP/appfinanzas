import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransfersPanel } from "@/components/transfers/TransfersPanel";
import { listBranches } from "@/lib/actions/branches";
import { listTransfers } from "@/lib/actions/transfers";
import { requireManager } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const session = await requireManager();
  const [branches, transfers] = await Promise.all([listBranches(), listTransfers()]);
  const active = branches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/inventory" />} aria-label="Volver al inventario">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Traspasos entre sucursales</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Mueve mercancía de una sucursal a otra. Descuenta el stock del origen y lo suma en el destino.
          </p>
        </div>
      </div>
      {active.length < 2 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Necesitas al menos dos sucursales activas para hacer traspasos. Agrega otra en Ajustes → Sucursales.
        </p>
      ) : (
        <TransfersPanel branches={active} defaultFromId={session.branchId ?? active[0].id} transfers={transfers} />
      )}
    </div>
  );
}

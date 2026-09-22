import { PendingSaleReview } from "@/components/pos/PendingSaleReview";
import { requireManager } from "@/lib/session";

// Manager-only — a queued offline sale's IndexedDB queue lives entirely in
// THIS browser/device, so there's nothing per-company/server-side to guard
// beyond "is this person allowed to manage this business" (same gate as
// Contabilidad/Administración de perfiles). No offline fallback for this
// page on purpose: reviewing/discarding a sale is a deliberate, online,
// manager action, not something that needs to work mid-outage.
export default async function PosReviewPage() {
  await requireManager();

  return (
    <div className="flex flex-col gap-4 p-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Ventas pendientes de revisión</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ventas hechas sin conexión que no se pudieron sincronizar automáticamente — por ejemplo,
          porque el stock ya no alcanzaba cuando volvió la conexión. Revísalas y decide si
          reintentar (tras reponer stock) o descartar.
        </p>
      </div>
      <PendingSaleReview />
    </div>
  );
}

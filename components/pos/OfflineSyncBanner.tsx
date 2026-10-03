"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { listPendingSales, syncPendingSales, type PendingSale } from "@/lib/offline/sync";

// Shows queued-offline-sale status on the POS page and auto-syncs them once
// the connection returns. Polls the local IndexedDB queue on an interval
// (rather than wiring an event bus to PosClient) since that queue is the
// single source of truth and polling it is simple and cheap.
export function OfflineSyncBanner({ canManage = false }: { canManage?: boolean }) {
  const online = useOnlineStatus();
  const [pending, setPending] = useState<PendingSale[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await listPendingSales());
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await syncPendingSales();
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    // Load from the local queue; state is only set from the promise callback.
    const load = () => listPendingSales().then(setPending);
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!online) return;
    // Deferred one tick so the "syncing" state isn't set from inside the effect
    // body. Only when connectivity flips back on — sync() is stable.
    const timer = setTimeout(sync, 0);
    return () => clearTimeout(timer);
  }, [online, sync]);

  if (!online) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        Sin conexión — puedes seguir vendiendo
        {pending.length > 0 &&
          `; ${pending.length} venta${pending.length === 1 ? "" : "s"} en espera`}
        , se sincronizará al reconectar.
      </div>
    );
  }

  if (pending.length === 0) return null;

  const withError = pending.find((p) => p.lastError);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
      <span>
        {syncing
          ? "Sincronizando..."
          : `${pending.length} venta${pending.length === 1 ? "" : "s"} pendiente${pending.length === 1 ? "" : "s"} de sincronizar`}
        {withError && (
          <span className="block text-xs text-destructive">
            {withError.lastError}
            {canManage && (
              <>
                {" "}
                <Link href="/pos/review" className="underline underline-offset-2">
                  Revisar
                </Link>
              </>
            )}
          </span>
        )}
      </span>
      <Button size="sm" variant="outline" disabled={syncing} onClick={sync}>
        Reintentar ahora
      </Button>
    </div>
  );
}

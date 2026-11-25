"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { createRefreshGate } from "@/lib/refresh-gate";

// Se suscribe a un canal de Supabase Realtime y refresca la ruta cuando llega un
// aviso — mantiene sincronizadas varias pestañas/terminales del mismo negocio.
//
// Antes cada llamada al hook abría su propio cliente + websocket (PosClient abría
// 2, el aviso de pagos otro, la tabla de inventario otros 2) y cada uno hacía su
// router.refresh(): una venta provocaba varias recargas del servidor y, en el
// teléfono, reconexiones en cascada al volver a primer plano. Ahora hay UN cliente
// compartido, UN canal por nombre y UN refresco por router (agrupado 400 ms, con
// hueco mínimo de 1.5 s y en pausa mientras la app está oculta).
const REFRESH_WAIT_MS = 400;
const REFRESH_MIN_GAP_MS = 1500;

type RouterLike = { refresh: () => void };
type Entry = {
  ch: RealtimeChannel;
  refs: number;
  // router -> eventos que ese router escucha (un router = un refresco).
  routers: Map<RouterLike, Map<symbol, string>>;
  gate: ReturnType<typeof createRefreshGate>;
  onVisibility: () => void;
};

let client: SupabaseClient | null = null;
let createClientFn: typeof import("@supabase/supabase-js").createClient | null = null;
const entries = new Map<string, Entry>();

// El SDK de Supabase (~200 KB sin comprimir) se descarga después de pintar la
// pantalla, no dentro del JS inicial de cada ruta.
let loading: Promise<void> | null = null;
function loadSupabase(): Promise<void> {
  if (createClientFn) return Promise.resolve();
  loading ??= import("@supabase/supabase-js").then((m) => {
    createClientFn = m.createClient;
  });
  return loading;
}

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!createClientFn) return null;
  client = createClientFn(url, key);
  return client;
}

function acquire(channel: string): Entry | null {
  const existing = entries.get(channel);
  if (existing) {
    existing.refs++;
    return existing;
  }
  const supabase = getClient();
  if (!supabase) return null;
  const entry: Entry = {
    ch: supabase.channel(channel),
    refs: 1,
    routers: new Map(),
    gate: createRefreshGate({
      waitMs: REFRESH_WAIT_MS,
      minGapMs: REFRESH_MIN_GAP_MS,
      isVisible: () => document.visibilityState === "visible",
      run: () => entry.routers.forEach((_, r) => r.refresh()),
    }),
    onVisibility: () => {
      if (document.visibilityState === "visible") entry.gate.onVisible();
    },
  };
  entry.ch
    .on("broadcast", { event: "*" }, (msg: { event?: string }) => {
      const ev = msg?.event;
      for (const listeners of entry.routers.values()) {
        for (const wanted of listeners.values()) {
          if (wanted === ev) {
            entry.gate.trigger();
            return;
          }
        }
      }
    })
    .subscribe();
  document.addEventListener("visibilitychange", entry.onVisibility);
  entries.set(channel, entry);
  return entry;
}

function release(channel: string) {
  const entry = entries.get(channel);
  if (!entry) return;
  if (--entry.refs > 0) return;
  entries.delete(channel);
  entry.gate.cancel();
  document.removeEventListener("visibilitychange", entry.onVisibility);
  client?.removeChannel(entry.ch);
}

export function useLiveRefresh(channel: string | null, event: string) {
  const router = useRouter();

  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    let undo: (() => void) | null = null;
    loadSupabase()
      .then(() => {
        if (cancelled) return;
        const entry = acquire(channel);
        if (!entry) return;
        const id = Symbol(event);
        let listeners = entry.routers.get(router);
        if (!listeners) {
          listeners = new Map();
          entry.routers.set(router, listeners);
        }
        listeners.set(id, event);
        undo = () => {
          const l = entry.routers.get(router);
          l?.delete(id);
          if (l && l.size === 0) entry.routers.delete(router);
          release(channel);
        };
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      undo?.();
    };
  }, [channel, event, router]);
}

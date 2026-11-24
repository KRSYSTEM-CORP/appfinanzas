"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { createCoalescer } from "@/lib/coalesce";

// Subscribes to a Supabase Realtime broadcast channel and refreshes the route
// when a ping arrives — keeps several open tabs/terminals of the same business
// in sync without polling. Pings that arrive close together (a sale emits
// "product" + "sale") are coalesced into ONE router.refresh() per 400 ms.
// Pass channel=null to skip subscribing.
const REFRESH_WAIT_MS = 400;

export function useLiveRefresh(channel: string | null, event: string) {
  const router = useRouter();

  useEffect(() => {
    if (!channel) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const coalescer = createCoalescer(() => router.refresh(), REFRESH_WAIT_MS);
    const supabase = createClient(url, key);
    const ch = supabase.channel(channel);
    ch.on("broadcast", { event }, () => coalescer.trigger()).subscribe();
    return () => {
      coalescer.cancel();
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, event]);
}

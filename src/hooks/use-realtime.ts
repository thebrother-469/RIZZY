import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to postgres_changes for the signed-in user's own rows.
 *
 * RLS is enforced by Supabase Realtime for `authenticated` subscribers, so a
 * user only ever receives change events for rows their SELECT policy allows.
 * Each table is additionally filtered server-side by the ownership column to
 * avoid shipping unrelated payloads over the socket.
 *
 * The subscription lives inside useEffect and is always torn down with
 * removeChannel() on unmount / identity change, so no channel leaks occur.
 */
export function useRealtimeRefresh(opts: {
  /** Channel name suffix — keep unique per screen. */
  channel: string;
  /** Tables to watch, with the column holding the owner id. */
  tables: Array<{ table: string; ownerColumn?: string }>;
  /** Current user id; subscription is skipped while null/undefined. */
  userId: string | null | undefined;
  /** Called (debounced) whenever a relevant change arrives. */
  onChange: () => void;
  /** Debounce window in ms to coalesce bursts. */
  debounceMs?: number;
  enabled?: boolean;
}) {
  const { channel, tables, userId, onChange, debounceMs = 400, enabled = true } = opts;

  // Keep the latest callback without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const tableKey = tables.map((t) => `${t.table}:${t.ownerColumn ?? "user_id"}`).join(",");

  useEffect(() => {
    if (!enabled || !userId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onChangeRef.current();
      }, debounceMs);
    };

    const ch = supabase.channel(`rt:${channel}:${userId}`);
    for (const entry of tableKey.split(",")) {
      const [table, ownerColumn] = entry.split(":");
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${ownerColumn}=eq.${userId}`,
        },
        fire,
      );
    }
    ch.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [channel, tableKey, userId, debounceMs, enabled]);
}

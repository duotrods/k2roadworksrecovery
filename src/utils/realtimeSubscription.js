import { supabase } from "../config/supabase";

// Generic "live list" subscription backing the Live Incidents boards
// (roadmap B4). Does an initial one-shot fetch, then keeps the list in
// sync via Postgres Realtime `postgres_changes` events. Each subscriber
// keeps its own local reducer instead of re-querying on every change —
// unlike Firestore's onSnapshot, Postgres Realtime delivers row-level
// INSERT/UPDATE/DELETE events, not a recomputed full result set.
//
// `matches`/scheme-scoping is done here in JS rather than via the
// Realtime subscription's server-side `filter` option, because that only
// supports simple `column=eq.value` predicates — not array-contains
// (`scheme_ids`) or the combined predicates these lists need. Security
// doesn't depend on this filter: RLS (already enabled on every table this
// is used with) is enforced by Realtime itself for authenticated
// connections, so a client only ever receives change events for rows
// their own policies permit — the JS `matches` check just narrows an
// already-authorized stream down to the specific board being rendered.
export function subscribeRealtimeList({
  table,
  initialFetch, // () => Promise<{ data, error }>
  matches, // (row) => boolean
  limit = null, // cap list length (oldest dropped first), or null for no cap
  callback,
  onError,
}) {
  let rows = [];
  let cancelled = false;

  const emit = () => {
    if (!cancelled) callback([...rows]);
  };

  initialFetch().then(({ data, error }) => {
    if (cancelled) return;
    if (error) {
      onError?.(error);
      return;
    }
    rows = data || [];
    emit();
  });

  const channelName = `${table}-${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => {
        if (cancelled) return;
        const { eventType, new: newRow, old: oldRow } = payload;

        if (eventType === "DELETE") {
          rows = rows.filter((r) => r.id !== oldRow.id);
        } else if (matches(newRow)) {
          const idx = rows.findIndex((r) => r.id === newRow.id);
          rows =
            idx === -1
              ? [newRow, ...rows]
              : rows.map((r) => (r.id === newRow.id ? newRow : r));
          if (limit) rows = rows.slice(0, limit);
        } else {
          // No longer matches (e.g. status moved away from "live") — drop it.
          rows = rows.filter((r) => r.id !== newRow.id);
        }
        emit();
      },
    )
    .subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        onError?.(err || new Error(`Realtime subscription ${status} for ${table}`));
      }
    });

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

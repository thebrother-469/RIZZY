import { useSyncExternalStore } from "react";

/**
 * Wall-clock time as a React external store.
 *
 * `Date.now()` is impure and must never be called during render (React
 * purity rules / react-hooks/purity). This module owns a single cached
 * timestamp that is advanced by one shared interval, so components read a
 * stable snapshot during render and re-render only when the tick advances.
 */

const listeners = new Set<() => void>();
let snapshot = typeof window === "undefined" ? 0 : Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
let intervalMs = 30_000;

function emit() {
  const next = Date.now();
  if (next === snapshot) return;
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(onStoreChange: () => void, ms: number): () => void {
  listeners.add(onStoreChange);
  if (snapshot === 0) snapshot = Date.now();
  if (timer === null || ms < intervalMs) {
    if (timer !== null) clearInterval(timer);
    intervalMs = ms;
    timer = setInterval(emit, ms);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
      intervalMs = 30_000;
    }
  };
}

function getSnapshot(): number {
  return snapshot;
}

/** SSR renders a zero clock; the first client tick fills it in. */
function getServerSnapshot(): number {
  return 0;
}

/**
 * Returns the current epoch milliseconds, refreshed every `ms`.
 * Returns `0` during SSR and on the very first client render.
 */
export function useNowMs(ms = 30_000): number {
  return useSyncExternalStore(
    (onStoreChange) => subscribe(onStoreChange, ms),
    getSnapshot,
    getServerSnapshot,
  );
}

/** Test-only reset so suites don't leak the shared interval. */
export function __resetClockForTests() {
  listeners.clear();
  if (timer !== null) clearInterval(timer);
  timer = null;
  snapshot = 0;
  intervalMs = 30_000;
}

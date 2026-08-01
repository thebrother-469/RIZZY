/**
 * Correlation IDs for client → server request tracing.
 *
 * Kept in its own module (rather than inline in components) because it reads
 * impure sources (`crypto.randomUUID`, `Date.now`) that must never be touched
 * during React's render phase. Call it only from event handlers or effects.
 */
export function newCorrelationId(prefix = "cid"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

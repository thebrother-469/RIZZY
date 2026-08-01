/**
 * Narrow, dependency-free helpers for working with `unknown` caught values.
 * Used so `catch` blocks never need `any`.
 */

/** Best-effort human-readable message for any thrown value. */
export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return fallback;
}

/** Reads a string-ish `code` field (Postgres / fetch errors) without casting to any. */
export function errorCode(e: unknown): string | null {
  if (e && typeof e === "object") {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") return String(code);
  }
  return null;
}

/** Reads a numeric `status`/`response.status` field, when present. */
export function errorStatus(e: unknown): number | null {
  if (!e || typeof e !== "object") return null;
  const direct = (e as { status?: unknown }).status;
  if (typeof direct === "number") return direct;
  const nested = (e as { response?: { status?: unknown } }).response?.status;
  return typeof nested === "number" ? nested : null;
}

/** Reads an optional string property from an unknown error-like object. */
export function errorField(e: unknown, field: string): string | null {
  if (!e || typeof e !== "object") return null;
  const value = (e as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

/** Reads an optional `name` (used to detect AbortError). */
export function errorName(e: unknown): string | null {
  return errorField(e, "name");
}

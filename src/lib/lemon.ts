import { createHmac, timingSafeEqual } from "node:crypto";

export type Plan = "free" | "pro" | "elite";

/** Timing-safe verification of the Lemon Squeezy `X-Signature` HMAC header. */
export function verifyLemonSignature(header: string, body: string, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(header, "hex");
    b = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (a.length === 0 || a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const ACTIVE_STATUSES = new Set(["active", "on_trial", "past_due", "paused"]);

/**
 * Resolve the app plan from a Lemon Squeezy subscription attributes payload.
 * Non-active statuses (cancelled, expired, unpaid, ...) map to `free`.
 */
export function resolvePlanFromVariant(
  variantId: string | number | null | undefined,
  status: string | null | undefined,
  variants: { proVariant: string; eliteVariant: string },
): Plan {
  const s = String(status ?? "");
  if (!ACTIVE_STATUSES.has(s)) return "free";
  const v = String(variantId ?? "");
  if (v && v === variants.eliteVariant) return "elite";
  if (v && v === variants.proVariant) return "pro";
  return "free";
}

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return ACTIVE_STATUSES.has(String(status ?? ""));
}

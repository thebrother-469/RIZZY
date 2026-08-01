/**
 * Extracted, testable auth helpers for the /api/public/lemon-sync cron route.
 * Keeping the parse + timing-safe compare here lets Vitest cover the
 * authorization surface without booting Nitro.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function extractBearerToken(header: string | null | undefined): string {
  const h = header ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}

export function isCronAuthorized(header: string | null | undefined, secret: string): boolean {
  if (!secret) return false;
  const provided = extractBearerToken(header);
  if (!provided) return false;
  return timingSafeEqualStr(provided, secret);
}

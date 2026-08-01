// Shared secret-redaction utility used by hydration diagnostics and
// SSR-init logging. Pure, no side effects, safe to import from anywhere.

// Env-var names whose values must never appear verbatim in logs/diagnostics.
// Values are pulled at call time so tests can seed process.env freely.
const SECRET_ENV_NAMES = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_PRO_VARIANT_ID",
  "LEMONSQUEEZY_ELITE_VARIANT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_JWKS",
  "SUPABASE_DB_URL",
  "LOVABLE_API_KEY",
  "HEALTH_CHECK_SECRET",
  "LEMON_SYNC_CRON_SECRET",
];

// Structural patterns for tokens/secrets that may appear even when the env
// var isn't populated in this runtime (e.g. copy/pasted into an error).
const STRUCTURAL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  // JWTs — three base64url segments joined by '.'.
  { re: /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, label: "[REDACTED_JWT]" },
  // New Supabase opaque keys: sb_publishable_... / sb_secret_...
  { re: /sb_(?:publishable|secret)_[A-Za-z0-9_-]{10,}/g, label: "[REDACTED_SUPABASE_KEY]" },
  // Bearer tokens in Authorization headers.
  { re: /Bearer\s+[A-Za-z0-9._-]{8,}/gi, label: "Bearer [REDACTED]" },
  // Cookie headers.
  { re: /Cookie:\s*[^\r\n]+/gi, label: "Cookie: [REDACTED]" },
  { re: /Set-Cookie:\s*[^\r\n]+/gi, label: "Set-Cookie: [REDACTED]" },
  // sb-*-auth-token cookie / storage payloads.
  { re: /sb-[a-z0-9-]+-auth-token[^\s"']*/gi, label: "[REDACTED_SUPABASE_COOKIE]" },
  // Password fields in query strings / JSON.
  { re: /("password"\s*:\s*")[^"]+(")/gi, label: '"password":"[REDACTED]"' },
  { re: /(password=)[^&\s"']+/gi, label: "password=[REDACTED]" },
  // service_role literal — allow the word to appear as key name, redact only value contexts.
  { re: /(service_role["'\s:=]{1,4})[A-Za-z0-9._-]{16,}/g, label: "service_role=[REDACTED]" },
  // LemonSqueezy-style API keys typically start with "lmsq_" or long hex.
  { re: /lmsq_[A-Za-z0-9]{16,}/gi, label: "[REDACTED_LEMON_KEY]" },
];

function collectRuntimeSecrets(): string[] {
  const out: string[] = [];
  if (typeof process === "undefined" || !process.env) return out;
  for (const name of SECRET_ENV_NAMES) {
    const v = process.env[name];
    if (typeof v === "string" && v.length >= 8) out.push(v);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes any known secret values / structural token patterns from a string.
 * Returns a redacted copy; never throws.
 */
export function redactSecrets(input: string | undefined | null): string {
  if (!input) return "";
  let out = String(input);
  // Runtime env values first (most specific).
  for (const v of collectRuntimeSecrets()) {
    if (!v) continue;
    try {
      out = out.split(v).join("[REDACTED_SECRET]");
    } catch {
      /* noop */
    }
  }
  // Then structural patterns.
  for (const { re, label } of STRUCTURAL_PATTERNS) {
    try {
      out = out.replace(re, label);
    } catch {
      /* noop */
    }
  }
  return out;
}

/**
 * Deep-redact a JSON-serializable payload. Strings pass through redactSecrets;
 * objects/arrays are walked. Non-serializable values are stringified defensively.
 */
export function redactPayload<T>(value: T): T {
  const seen = new WeakSet<object>();
  const visit = (v: unknown): unknown => {
    if (v == null) return v;
    if (typeof v === "string") return redactSecrets(v);
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "bigint") return String(v);
    if (Array.isArray(v)) return v.map(visit);
    if (typeof v === "object") {
      if (seen.has(v as object)) return "[Circular]";
      seen.add(v as object);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) {
        out[k] = visit(val);
      }
      return out;
    }
    return redactSecrets(String(v));
  };
  return visit(value) as T;
}

// Exposed for tests only.
export const __internals = { SECRET_ENV_NAMES, STRUCTURAL_PATTERNS, escapeRegExp };

/**
 * Secret-safe structured logger for Supabase client initialization failures.
 *
 * Emits ONLY a fixed shape (module, timestamp, route, environment, buildId,
 * errorClass, message, stack, supabaseHost). Never emits headers, cookies,
 * tokens, or session fields. Every string that leaves this module is passed
 * through `redactSecrets` first — which strips known secret env values,
 * Authorization/Cookie/Set-Cookie lines, JWT-shaped tokens, `sb_secret_*`
 * strings, and common token/session query params.
 */

const SECRET_ENV_NAMES = [
  "LEMONSQUEEZY_API_KEY",
  "LEMONSQUEEZY_WEBHOOK_SECRET",
  "LEMONSQUEEZY_STORE_ID",
  "LEMONSQUEEZY_PRO_VARIANT_ID",
  "LEMONSQUEEZY_ELITE_VARIANT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_JWKS",
  "LOVABLE_API_KEY",
  "HEALTH_CHECK_SECRET",
  "LEMON_SYNC_CRON_SECRET",
] as const;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;

  for (const name of SECRET_ENV_NAMES) {
    const v = process.env[name];
    if (v && v.length >= 6) {
      out = out.split(v).join("[REDACTED]");
    }
  }

  // JWT-shaped tokens (three base64url segments)
  out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]");
  // sb_secret_* opaque keys
  out = out.replace(/sb_secret_[A-Za-z0-9_-]+/g, "[REDACTED_SB_SECRET]");
  // Authorization: Bearer <anything>
  out = out.replace(/Authorization:\s*Bearer\s+[^\s;,"']+/gi, "Authorization: Bearer [REDACTED]");
  out = out.replace(/Bearer\s+[^\s;,"']+/g, "Bearer [REDACTED]");
  // Cookie / Set-Cookie header lines
  out = out.replace(/(?:^|\s)(Set-)?Cookie:\s*[^\n\r]*/gi, " [REDACTED_COOKIE]");
  // Common token query/body params
  out = out.replace(
    /\b(access_token|refresh_token|id_token|api[_-]?key|apikey|session|password|secret|token|sb-[a-z0-9-]+-auth-token)=[^\s&;"']+/gi,
    "$1=[REDACTED]",
  );

  return out;
}

export interface BuildInitLogOptions {
  environment: "ssr" | "browser" | "edge" | (string & {});
  buildId?: string;
  url?: string;
  now?: Date;
  supabaseUrl?: string;
}

export interface SupabaseInitFailureLog {
  module: "src/integrations/supabase/client.ts";
  timestamp: string;
  route: string | null;
  environment: string;
  buildId: string | null;
  errorClass: string;
  message: string;
  stack?: string;
  supabaseHost: string;
}

function safeHost(u: string | undefined): string {
  if (!u) return "unknown";
  try {
    return new URL(u).host || "unknown";
  } catch {
    return "unknown";
  }
}

export function buildSupabaseInitFailureLog(
  error: unknown,
  opts: BuildInitLogOptions,
): SupabaseInitFailureLog {
  const err =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "unknown-error");
  const supabaseUrl =
    opts.supabaseUrl ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";

  return {
    module: "src/integrations/supabase/client.ts",
    timestamp: (opts.now ?? new Date()).toISOString(),
    route: opts.url ? redactSecrets(opts.url) : null,
    environment: opts.environment,
    buildId: opts.buildId ?? null,
    errorClass: err.name || "Error",
    message: redactSecrets(err.message || ""),
    stack: err.stack ? redactSecrets(err.stack) : undefined,
    supabaseHost: safeHost(supabaseUrl),
  };
}

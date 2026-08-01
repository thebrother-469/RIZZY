/**
 * Server-only resolution and validation of the single AI runtime secret.
 *
 * Contract:
 * - `LOVABLE_API_KEY` is the ONE AND ONLY AI key for the whole application
 *   (profile generator, coaching, missions, future AI tools). There is no
 *   per-feature AI secret.
 * - The key is NEVER returned to the client, logged, or embedded in an error
 *   message. Operator diagnostics carry only non-reversible metadata
 *   (which variable, why it failed, key length).
 * - Callers get a stable, user-safe message: `AI_CONFIG_USER_MESSAGE`.
 *
 * This module is pure (env is injected) so every branch is unit-testable
 * without mutating `process.env`.
 */

/** The single source of truth for AI authentication. */
export const AI_KEY_ENV_NAME = "LOVABLE_API_KEY" as const;

/**
 * Deprecated aliases kept ONLY so a legacy deployment that still exports one
 * of these does not hard-fail. They resolve to the same effective key; no
 * production code path requires them and nothing should add new ones.
 */
export const AI_KEY_DEPRECATED_ALIASES = ["LOVABLE_API_KEY_PROFILE"] as const;

/** Exact string shown to end users. Must never leak configuration detail. */
export const AI_CONFIG_USER_MESSAGE =
  "The AI service is temporarily unavailable. Please contact the administrator.";

/** Exact operator log line required when the key is absent. */
export const AI_KEY_MISSING_LOG_MESSAGE =
  "LOVABLE_API_KEY is not configured in the server runtime.";

export type AiKeyEnvName = string;

export type AiKeyFailureCode = "AI_KEY_MISSING" | "AI_KEY_INVALID";

export interface AiKeyMeta {
  /** Which env var the value came from (or was expected in). */
  source: AiKeyEnvName;
  /** Length only — never any part of the secret itself. */
  length: number;
}

export type AiKeyResolution =
  | { ok: true; key: string; meta: AiKeyMeta; usedFallback: boolean }
  | {
      ok: false;
      code: AiKeyFailureCode;
      meta: AiKeyMeta;
      /** Operator-facing explanation. Safe to log. */
      reason: string;
      /** Exact action an operator must take. Safe to log. */
      operatorAction: string;
    };

export type EnvSource = Record<string, string | undefined>;

/** Obvious non-secrets that indicate a template/placeholder was deployed. */
const PLACEHOLDERS = new Set([
  "changeme",
  "placeholder",
  "your-api-key",
  "your_api_key",
  "todo",
  "undefined",
  "null",
  "none",
  "xxx",
  "test",
]);

const MIN_KEY_LENGTH = 20;

export const OPERATOR_ACTION_MISSING =
  `Set the ${AI_KEY_ENV_NAME} secret in the project's server environment, ` +
  `then redeploy/restart so the worker picks up the new secret.`;

export const OPERATOR_ACTION_INVALID =
  `Replace the ${AI_KEY_ENV_NAME} secret with the real Lovable AI Gateway key ` +
  `(no surrounding quotes, no whitespace, at least ${MIN_KEY_LENGTH} characters), then redeploy/restart.`;

/**
 * Validates a single candidate value. Returns `null` when valid, otherwise a
 * short operator-facing reason string.
 */
export function validateAiKeyValue(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return "not set";
  if (raw.trim().length === 0) return "empty or whitespace-only";
  if (raw !== raw.trim()) return "has leading/trailing whitespace";
  if (/\s/.test(raw)) return "contains whitespace";
  if (/^['"].*['"]$/.test(raw)) return "wrapped in quotes";
  if (PLACEHOLDERS.has(raw.toLowerCase())) return "looks like a placeholder value";
  if (raw.length < MIN_KEY_LENGTH) return `too short (${raw.length} < ${MIN_KEY_LENGTH} chars)`;
  return null;
}

/**
 * Resolves the effective AI key from an env dictionary.
 *
 * `LOVABLE_API_KEY` is authoritative. A deprecated alias is consulted only
 * when the canonical variable is entirely absent, and is reported via
 * `usedFallback` so operators can migrate.
 */
export function resolveAiKey(env: EnvSource): AiKeyResolution {
  const canonical = env[AI_KEY_ENV_NAME];
  if (canonical !== undefined && canonical !== null && canonical !== "") {
    const reason = validateAiKeyValue(canonical);
    if (reason) {
      return {
        ok: false,
        code: "AI_KEY_INVALID",
        meta: { source: AI_KEY_ENV_NAME, length: canonical.length },
        reason: `${AI_KEY_ENV_NAME} is ${reason}`,
        operatorAction: OPERATOR_ACTION_INVALID,
      };
    }
    return {
      ok: true,
      key: canonical,
      meta: { source: AI_KEY_ENV_NAME, length: canonical.length },
      usedFallback: false,
    };
  }

  for (const alias of AI_KEY_DEPRECATED_ALIASES) {
    const value = env[alias];
    if (!value) continue;
    const reason = validateAiKeyValue(value);
    if (reason) {
      return {
        ok: false,
        code: "AI_KEY_INVALID",
        meta: { source: alias, length: value.length },
        reason: `${AI_KEY_ENV_NAME} is not set and deprecated ${alias} is ${reason}`,
        operatorAction: OPERATOR_ACTION_INVALID,
      };
    }
    return {
      ok: true,
      key: value,
      meta: { source: alias, length: value.length },
      usedFallback: true,
    };
  }

  return {
    ok: false,
    code: "AI_KEY_MISSING",
    meta: { source: AI_KEY_ENV_NAME, length: 0 },
    reason: AI_KEY_MISSING_LOG_MESSAGE,
    operatorAction: OPERATOR_ACTION_MISSING,
  };
}

/**
 * Structured configuration error. `.message` is user-safe; `.operator` holds
 * the diagnostic detail for logs. No secret material in either.
 */
export class AiConfigurationError extends Error {
  readonly code: AiKeyFailureCode;
  readonly httpStatus = 503;
  readonly operator: { reason: string; operatorAction: string; source: AiKeyEnvName };

  constructor(failure: Extract<AiKeyResolution, { ok: false }>) {
    super(AI_CONFIG_USER_MESSAGE);
    this.name = "AiConfigurationError";
    this.code = failure.code;
    this.operator = {
      reason: failure.reason,
      operatorAction: failure.operatorAction,
      source: failure.meta.source,
    };
  }
}

export interface AiKeyLogger {
  error: (message: string, fields?: Record<string, unknown>) => void;
  warn?: (message: string, fields?: Record<string, unknown>) => void;
}

/**
 * Returns the key or throws `AiConfigurationError`, emitting one structured
 * operator log line on failure. Never logs the key.
 */
export function requireAiKey(
  env: EnvSource,
  log?: AiKeyLogger,
  context: Record<string, unknown> = {},
): string {
  const resolved = resolveAiKey(env);
  if (resolved.ok) return resolved.key;
  log?.error("ai_key_configuration_error", {
    ...context,
    event: "ai_key_configuration_error",
    code: resolved.code,
    env_var: resolved.meta.source,
    reason: resolved.reason,
    operator_action: resolved.operatorAction,
  });
  throw new AiConfigurationError(resolved);
}

/** Startup probe used by env validation. Never throws. */
export function reportAiKeyAtStartup(env: EnvSource, log?: AiKeyLogger): AiKeyResolution {
  const resolved = resolveAiKey(env);
  if (!resolved.ok) {
    log?.error(
      resolved.code === "AI_KEY_MISSING"
        ? AI_KEY_MISSING_LOG_MESSAGE
        : "ai_key_startup_check_failed",
      {
        event: "ai_key_startup_check_failed",
        code: resolved.code,
        env_var: resolved.meta.source,
        reason: resolved.reason,
        operator_action: resolved.operatorAction,
      },
    );
  } else if (resolved.usedFallback) {
    log?.warn?.("ai_key_startup_deprecated_alias", {
      event: "ai_key_startup_deprecated_alias",
      env_var: resolved.meta.source,
      reason: `${AI_KEY_ENV_NAME} not set — running on deprecated ${resolved.meta.source}`,
    });
  }
  return resolved;
}

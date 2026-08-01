/**
 * Standardized AI failure taxonomy + structured operator logging.
 *
 * Every AI subsystem (profile generator, coaching, missions, future tools)
 * classifies failures with the SAME categories and emits the SAME log shape:
 *
 *   { ts, level, subsystem, event, error_category, request_id, trace_id, ... }
 *
 * Rules enforced by tests/unit/errors/ai-error-handling.test.ts:
 *  - user-facing messages never contain secrets, stack traces, or internals
 *  - operator logs never contain the secret value
 *  - every log line carries a timestamp, subsystem and error category, plus
 *    the correlation IDs when the caller has them
 */
import { MSG } from "./profile-generator.core";
import { AI_CONFIG_USER_MESSAGE } from "./ai-key";

export const AI_ERROR_CATEGORIES = [
  "configuration_error",
  "authentication_error",
  "rate_limit",
  "quota_exceeded",
  "parsing_error",
  "validation_error",
  "service_error",
] as const;

export type AiErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];

/** Exact user-safe message for each category. Never leaks internals. */
export const AI_USER_MESSAGE: Record<AiErrorCategory, string> = {
  configuration_error: AI_CONFIG_USER_MESSAGE,
  authentication_error: AI_CONFIG_USER_MESSAGE,
  rate_limit: MSG.tooManyRequests,
  quota_exceeded: "You've reached your generation limit. Upgrade for more.",
  parsing_error: MSG.malformedJson,
  validation_error: "That input isn't valid. Adjust it and try again.",
  service_error: MSG.upstreamFailure,
};

/**
 * Maps an upstream AI gateway HTTP status to a category.
 * 401/403 => the configured key is present but rejected.
 */
export function categorizeGatewayStatus(status: number): AiErrorCategory {
  if (status === 401 || status === 403) return "authentication_error";
  if (status === 429) return "rate_limit";
  if (status === 402) return "quota_exceeded";
  return "service_error";
}

export interface AiErrorLogContext {
  subsystem: string;
  category: AiErrorCategory;
  request_id?: string;
  trace_id?: string;
  user_id?: string;
  /** Operator-only detail. Must not be a secret; it is redacted downstream. */
  detail?: string;
  status?: number;
}

export interface MinimalLogger {
  error: (message: string, fields?: Record<string, unknown>) => void;
}

/**
 * Removes anything key-shaped from free-text operator detail before it is
 * logged. The structured logger only redacts known secret-named FIELDS, so
 * inline `api_key=...` text inside a message must be scrubbed here.
 */
export function scrubDetail(detail: string): string {
  return detail
    .replace(
      /(api[-_]?key|apikey|token|secret|password|authorization|bearer)(\s*[=:]\s*|\s+)\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/\b(lv|sb|sk|pk)_[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");
}

/** Fields for one structured operator log line. Pure, so it is testable. */
export function aiErrorLogFields(
  ctx: AiErrorLogContext,
  now: Date = new Date(),
): Record<string, unknown> {
  return {
    ts: now.toISOString(),
    event: "ai_error",
    subsystem: ctx.subsystem,
    error_category: ctx.category,
    ...(ctx.request_id ? { request_id: ctx.request_id } : {}),
    ...(ctx.trace_id ? { trace_id: ctx.trace_id } : {}),
    ...(ctx.user_id ? { user_id: ctx.user_id } : {}),
    ...(ctx.status !== undefined ? { status: ctx.status } : {}),
    ...(ctx.detail ? { detail: scrubDetail(ctx.detail).slice(0, 300) } : {}),
  };
}

/** Emits the structured operator log and returns the user-safe message. */
export function logAiError(log: MinimalLogger, ctx: AiErrorLogContext): string {
  log.error("ai_error", aiErrorLogFields(ctx));
  return AI_USER_MESSAGE[ctx.category];
}

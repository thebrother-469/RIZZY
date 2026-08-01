/**
 * Auth audit logging helper.
 *
 * Server-side only. Writes structured events to `public.auth_audit_logs`
 * using the service-role client. RLS lets end-users read only their own
 * rows; writes are locked to service_role.
 *
 * Passwords, tokens and session secrets must never be passed in `metadata`
 * — the structured logger's redactor strips known secret shapes, but the
 * audit table is the source of truth so we keep it clean at the caller.
 */
import { logger } from "./structured-logger";
import type { Json } from "@/integrations/supabase/types";

export type AuthAuditEvent =
  // successes
  | "login"
  | "logout"
  | "oauth_login"
  | "token_refresh"
  | "session_restore"
  // failures
  | "invalid_password"
  | "blocked_login"
  | "rate_limit_hit"
  | "anonymous_attempt";

const FAILURE_EVENTS = new Set<AuthAuditEvent>([
  "invalid_password",
  "blocked_login",
  "rate_limit_hit",
  "anonymous_attempt",
]);

export interface AuthAuditInput {
  event_type: AuthAuditEvent;
  user_id?: string | null;
  request_id?: string;
  trace_id?: string;
  ip?: string | null;
  user_agent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Salted hash of a client IP so operators can correlate failures without
 * storing raw addresses. Salt comes from AUTH_AUDIT_IP_SALT when present;
 * otherwise we fall back to a stable per-process value so logs are still
 * correlatable within a deploy.
 */
async function hashIp(ip: string | null | undefined): Promise<string | null> {
  if (!ip) return null;
  const salt = process.env.AUTH_AUDIT_IP_SALT ?? "rizzgod-audit-v1";
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex.slice(0, 32);
}

/**
 * Record an auth event. Never throws — audit logging must not break login.
 */
export async function recordAuthEvent(input: AuthAuditInput): Promise<void> {
  const result: "success" | "failure" = FAILURE_EVENTS.has(input.event_type)
    ? "failure"
    : "success";
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ip_hash = await hashIp(input.ip);
    const { error } = await supabaseAdmin.from("auth_audit_logs").insert({
      user_id: input.user_id ?? null,
      event_type: input.event_type,
      result,
      request_id: input.request_id ?? null,
      trace_id: input.trace_id ?? null,
      ip_hash,
      user_agent: input.user_agent?.slice(0, 512) ?? null,
      metadata: (input.metadata ?? {}) as Json,
    });
    if (error) {
      logger.warn("auth_audit_insert_failed", {
        event: "auth_audit_insert_failed",
        event_type: input.event_type,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("auth_audit_write_error", {
      event: "auth_audit_write_error",
      event_type: input.event_type,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Also mirror to structured logs so events show up in aggregated logs even
  // when the DB write fails.
  logger.info(`auth_event:${input.event_type}`, {
    event: `auth_event:${input.event_type}`,
    result,
    user_id: input.user_id ?? undefined,
    request_id: input.request_id,
    trace_id: input.trace_id,
  });
}

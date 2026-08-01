import { errorCode, errorField, errorStatus } from "./errors";
// Production-safe observability for onboarding + daily-mission.
//
// Feature-flagged via env vars:
//   ONBOARDING_DEBUG_ENABLED       -> onboarding_debug_events writes
//   DAILY_MISSION_DEBUG_ENABLED    -> daily_mission_debug_events writes
//
// When disabled: no DB writes, no behavioural change, near-zero overhead.
// When enabled: structured events persisted via service role (RLS-safe).
//
// Correlation IDs propagate client -> server fn -> DB events -> response.
// Every log line uses the same `cid` field for grep-friendly tracing.

const SENSITIVE_KEY_RE =
  /(authorization|cookie|password|token|jwt|refresh|api[_-]?key|service[_-]?role|secret|bearer|session)/i;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Recursively strip fields whose keys look sensitive. Truncates long strings.
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (value == null) return value;
  if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 500);
}

function serializeError(err: unknown): Record<string, unknown> | null {
  if (!err) return null;
  if (err instanceof Error) {
    return sanitize({
      name: err.name,
      message: err.message,
      code: errorCode(err),
      status: errorStatus(err),
      details: errorField(err, "details"),
      hint: errorField(err, "hint"),
    }) as Record<string, unknown>;
  }
  if (isPlainObject(err)) return sanitize(err) as Record<string, unknown>;
  return { message: String(err).slice(0, 500) };
}

export type Subsystem = "onboarding" | "daily_mission";
export type Severity = "info" | "warn" | "error";

export function newCorrelationId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Non-crypto fallback (SSR edge runtimes lacking crypto.randomUUID).
    return "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0");
  }
}

function tableFor(subsystem: Subsystem): string {
  return subsystem === "onboarding" ? "onboarding_debug_events" : "daily_mission_debug_events";
}

function flagEnabled(subsystem: Subsystem): boolean {
  const raw =
    subsystem === "onboarding"
      ? process.env.ONBOARDING_DEBUG_ENABLED
      : process.env.DAILY_MISSION_DEBUG_ENABLED;
  if (!raw) return false;
  const v = String(raw).toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function isDebugEnabled(subsystem: Subsystem): boolean {
  return flagEnabled(subsystem);
}

export interface DebugEmitInput {
  correlationId: string;
  subsystem: Subsystem;
  event: string;
  userId?: string | null;
  severity?: Severity;
  success?: boolean | null;
  payload?: unknown;
  error?: unknown;
}

// Persist a structured debug event when the subsystem flag is on. Never throws;
// observability failures must not affect the caller's flow.
export async function emitDebugEvent(input: DebugEmitInput): Promise<void> {
  const {
    correlationId,
    subsystem,
    event,
    userId,
    severity = "info",
    success = null,
    payload,
    error,
  } = input;

  const errJson = serializeError(error);
  const payloadJson = sanitize(payload ?? {});

  // Always emit a compact console line (grep-friendly). Flag OFF still logs
  // a single line — this is minimal and secret-free.
  const tag = `[${subsystem}][cid=${correlationId}] ${event}`;
  if (severity === "error") {
    console.error(tag, { userId: userId ?? null, payload: payloadJson, error: errJson });
  } else if (severity === "warn") {
    console.warn(tag, { userId: userId ?? null, payload: payloadJson });
  } else {
    console.log(tag, { userId: userId ?? null, payload: payloadJson });
  }

  if (!flagEnabled(subsystem)) return;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const debugRow = {
      correlation_id: correlationId,
      user_id: userId ?? null,
      event_name: event,
      subsystem,
      severity,
      success,
      payload_json: payloadJson,
      error_json: errJson,
    };
    // Table name is resolved at runtime, so the generated row types cannot be
    // narrowed statically here.
    const { error: insErr } = await supabaseAdmin
      .from(tableFor(subsystem) as never)
      .insert(debugRow as never);
    if (insErr) {
      console.warn(`[observability] debug insert failed`, {
        subsystem,
        cid: correlationId,
        event,
        error: insErr.message,
      });
    }
  } catch (e) {
    console.warn(`[observability] debug emit crashed`, {
      subsystem,
      cid: correlationId,
      event,
      error: (e as Error)?.message,
    });
  }
}

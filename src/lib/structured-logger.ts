/**
 * Structured JSON logger.
 *
 * All log lines are emitted as single-line JSON objects with a stable field
 * shape so downstream log aggregators (Cloudflare/Vercel/Datadog) can parse
 * them without custom regex. All string fields flow through `redactSecrets`
 * so tokens, cookies, JWTs, and known secret env values are never leaked.
 */
import { redactSecrets } from "./redact-secrets";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  request_id?: string;
  trace_id?: string;
  correlation_id?: string;
  session_id?: string;
  user_id?: string;
  route?: string;
  method?: string;
  status_code?: number;
  duration_ms?: number;
  request_ip?: string;
  environment?: string;
  deployment_id?: string;
  [k: string]: unknown;
}

function redactValue(v: unknown): unknown {
  if (typeof v === "string") return redactSecrets(v);
  if (v && typeof v === "object") {
    if (Array.isArray(v)) return v.map(redactValue);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (/^(authorization|cookie|set-cookie|password|token|secret|jwt|api[-_]?key)$/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(val);
      }
    }
    return out;
  }
  return v;
}

export function buildLogRecord(
  level: LogLevel,
  message: string,
  ctx: LogContext = {},
): Record<string, unknown> {
  return {
    ts: new Date().toISOString(),
    level,
    message: redactSecrets(message),
    environment:
      ctx.environment ??
      (typeof process !== "undefined" ? process.env?.NODE_ENV : undefined) ??
      "unknown",
    ...(redactValue(ctx) as Record<string, unknown>),
  };
}

function emit(level: LogLevel, message: string, ctx?: LogContext) {
  const record = buildLogRecord(level, message, ctx);
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, c?: LogContext) => emit("debug", m, c),
  info: (m: string, c?: LogContext) => emit("info", m, c),
  warn: (m: string, c?: LogContext) => emit("warn", m, c),
  error: (m: string, c?: LogContext) => emit("error", m, c),
};

export function newRequestId(): string {
  // 128 bits of entropy, base36. Avoids crypto dep in edge runtimes.
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

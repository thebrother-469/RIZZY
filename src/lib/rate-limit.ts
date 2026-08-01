/**
 * Production rate limiter (Upstash Redis, sliding window).
 *
 * Design:
 * - Sliding-window over `windowSec`, using Redis ZSET timestamps.
 * - Keys are namespaced by route + identity (user id when signed in, else IP).
 * - Fails **closed** in production when Upstash env vars are missing so an
 *   unconfigured deploy cannot silently disable protection. Fails **open**
 *   in development (logs a warning) so local dev stays unblocked.
 *
 * Deployment: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
import { logger, newRequestId } from "./structured-logger";
import { newTraceId } from "./otel";

export type LimitOutcome =
  | { allowed: true; remaining: number; limit: number; reset_sec: number }
  | {
      allowed: false;
      remaining: 0;
      limit: number;
      reset_sec: number;
      retry_after: number;
      request_id: string;
      trace_id: string;
    };

export interface LimitConfig {
  /** logical route tag used in the redis key namespace, e.g. "auth:login" */
  route: string;
  /** window length in seconds */
  windowSec: number;
  /** max requests per identity per window */
  max: number;
  /** identity to bucket on — user id preferred, IP fallback */
  identity: string;
  request_id?: string;
  trace_id?: string;
}

function isProd() {
  return process.env.NODE_ENV === "production";
}

function upstashEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/**
 * Parse Upstash pipeline response with strict validation.
 * Returns a number or throws on invalid structure.
 */
function parseUpstashCount(countRes: unknown): number {
  // Handle object with result property
  if (countRes && typeof countRes === "object" && "result" in countRes) {
    const result = (countRes as { result: unknown }).result;
    if (typeof result === "number" && Number.isFinite(result) && result >= 0) {
      return result;
    }
  }
  // Handle direct number
  if (typeof countRes === "number" && Number.isFinite(countRes) && countRes >= 0) {
    return countRes;
  }
  // Invalid structure
  throw new Error(
    `Invalid Upstash ZCARD response: ${JSON.stringify(countRes)} (expected number or {result: number})`,
  );
}

/** Upstash REST pipeline responses are positional and loosely typed. */
export type UpstashPipelineResult = Array<{ result?: unknown; error?: string } | unknown>;

/**
 * Pipeline against Upstash's REST API. One HTTP round trip per check.
 */
async function upstashPipeline(
  env: { url: string; token: string },
  cmds: unknown[][],
): Promise<UpstashPipelineResult> {
  const res = await fetch(`${env.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) {
    throw new Error(`upstash_pipeline_failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as UpstashPipelineResult;
}

/**
 * Check-and-consume a slot. Returns the outcome; caller is responsible for
 * translating a denial into an HTTP 429 response.
 */
export async function checkRateLimit(cfg: LimitConfig): Promise<LimitOutcome> {
  const env = upstashEnv();
  const request_id = cfg.request_id ?? newRequestId();
  const trace_id = cfg.trace_id ?? newTraceId();

  if (!env) {
    if (isProd()) {
      logger.error("rate_limiter_unavailable_prod", {
        event: "rate_limiter_unavailable_prod",
        route: cfg.route,
        request_id,
        trace_id,
      });
      // Fail closed. Caller should surface 503, not silently allow.
      return {
        allowed: false,
        remaining: 0,
        limit: cfg.max,
        reset_sec: cfg.windowSec,
        retry_after: cfg.windowSec,
        request_id,
        trace_id,
      };
    }
    logger.warn("rate_limiter_unavailable_dev", {
      event: "rate_limiter_unavailable_dev",
      route: cfg.route,
      request_id,
    });
    return { allowed: true, remaining: cfg.max, limit: cfg.max, reset_sec: cfg.windowSec };
  }

  const nowMs = Date.now();
  const windowMs = cfg.windowSec * 1000;
  const key = `rl:${cfg.route}:${cfg.identity}`;
  const member = `${nowMs}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const [, , countRes] = await upstashPipeline(env, [
      ["ZREMRANGEBYSCORE", key, 0, nowMs - windowMs],
      ["ZADD", key, nowMs, member],
      ["ZCARD", key],
      ["PEXPIRE", key, windowMs],
    ]);

    let count = 0;
    try {
      count = parseUpstashCount(countRes);
    } catch (parseErr) {
      logger.warn("rate_limit_parse_error", {
        event: "rate_limit_parse_error",
        route: cfg.route,
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        countRes: JSON.stringify(countRes),
        request_id,
        trace_id,
      });
      // Default to 0 on parse failure (conservative: allow the request)
      count = 0;
    }

    if (count > cfg.max) {
      logger.warn("rate_limit_hit", {
        event: "rate_limit_hit",
        route: cfg.route,
        identity: cfg.identity,
        count,
        limit: cfg.max,
        request_id,
        trace_id,
      });
      return {
        allowed: false,
        remaining: 0,
        limit: cfg.max,
        reset_sec: cfg.windowSec,
        retry_after: cfg.windowSec,
        request_id,
        trace_id,
      };
    }
    return {
      allowed: true,
      remaining: Math.max(0, cfg.max - count),
      limit: cfg.max,
      reset_sec: cfg.windowSec,
    };
  } catch (err) {
    logger.error("rate_limit_backend_error", {
      event: "rate_limit_backend_error",
      route: cfg.route,
      error: err instanceof Error ? err.message : String(err),
      request_id,
    });
    if (isProd()) {
      // Backend down in prod → fail closed.
      return {
        allowed: false,
        remaining: 0,
        limit: cfg.max,
        reset_sec: cfg.windowSec,
        retry_after: cfg.windowSec,
        request_id,
        trace_id,
      };
    }
    return { allowed: true, remaining: cfg.max, limit: cfg.max, reset_sec: cfg.windowSec };
  }
}

/**
 * Convenience: build a standard 429 Response body when a caller wants to
 * translate a denial into an HTTP error.
 */
export function rateLimitResponseBody(o: Extract<LimitOutcome, { allowed: false }>) {
  return {
    error: "rate_limit_exceeded",
    retry_after: o.retry_after,
    limit: o.limit,
    remaining: 0,
    request_id: o.request_id,
    trace_id: o.trace_id,
  };
}

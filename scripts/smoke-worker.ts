#!/usr/bin/env bun
/**
 * scripts/smoke-worker.ts
 *
 * CI worker readiness smoke test. Calls the deployed /api/healthz with the
 * shared HEALTH_CHECK_SECRET, retries transient failures with exponential
 * backoff, and prints structured evidence. Exits 0 on healthy, 1 otherwise.
 *
 * Required env:
 *   SMOKE_BASE_URL       — e.g. https://project--<id>.lovable.app
 *   HEALTH_CHECK_SECRET  — matches the deployed worker secret
 *
 * Optional env:
 *   SMOKE_TIMEOUT_MS     — per-attempt fetch timeout, default 15000
 */

export const DEFAULT_SMOKE_TIMEOUT_MS = 15_000;
export const RETRY_DELAYS_MS = [500, 1000, 2000];
export const RETRYABLE_STATUS = new Set([502, 503, 504]);
export const NON_RETRYABLE_STATUS = new Set([401, 403, 404]);

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

export interface SmokeEvidence {
  endpoint: string;
  attempt: number;
  status: number | null;
  latency_ms: number;
  timestamp: string;
  retry_count: number;
  health_status: string | null;
  supabase_status: "ok" | "fail" | "skipped" | null;
  failure_reason: string | null;
}

export interface SmokeResult {
  exitCode: 0 | 1;
  evidence: SmokeEvidence;
  attempts: SmokeEvidence[];
}

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export function isNonRetryableStatus(status: number): boolean {
  return NON_RETRYABLE_STATUS.has(status);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface RunSmokeOptions {
  baseURL: string;
  secret: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

export async function runSmoke(opts: RunSmokeOptions): Promise<SmokeResult> {
  const endpoint = `${opts.baseURL.replace(/\/+$/, "")}/api/healthz`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SMOKE_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const sleepImpl = opts.sleepImpl ?? sleep;
  const maxAttempts = opts.maxAttempts ?? RETRY_DELAYS_MS.length + 1;

  const attempts: SmokeEvidence[] = [];
  let lastEvidence: SmokeEvidence | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status: number | null = null;
    let failure_reason: string | null = null;
    let health_status: string | null = null;
    let supabase_status: SmokeEvidence["supabase_status"] = null;

    try {
      const res = await fetchImpl(endpoint, {
        method: "GET",
        headers: { "x-health-secret": opts.secret },
        signal: controller.signal,
      });
      status = res.status;
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      health_status = typeof body.status === "string" ? (body.status as string) : null;
      const checks = (body.checks ?? {}) as Record<string, unknown>;
      const db = (checks.supabase_db as { status?: string } | undefined)?.status;
      const auth = (checks.supabase_auth as { status?: string } | undefined)?.status;
      supabase_status = db === "ok" && auth === "ok" ? "ok" : db || auth ? "fail" : "skipped";
      if (status !== 200) failure_reason = `http_${status}`;
      else if (supabase_status !== "ok") failure_reason = `supabase_${supabase_status}`;
    } catch (err) {
      failure_reason =
        (err as Error).name === "AbortError" ? "timeout" : `network:${(err as Error).message}`;
    } finally {
      clearTimeout(timer);
    }

    const evidence: SmokeEvidence = {
      endpoint,
      attempt,
      status,
      latency_ms: Date.now() - started,
      timestamp: new Date().toISOString(),
      retry_count: attempt - 1,
      health_status,
      supabase_status,
      failure_reason,
    };
    attempts.push(evidence);
    lastEvidence = evidence;

    const healthy = status === 200 && supabase_status === "ok";
    if (healthy) return { exitCode: 0, evidence, attempts };

    const retryable =
      status === null /* network/timeout */ || (status !== null && isRetryableStatus(status));
    const nonRetryable = status !== null && isNonRetryableStatus(status);
    if (!retryable || nonRetryable) break;
    if (attempt >= maxAttempts) break;

    const delay = RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
    await sleepImpl(delay);
  }

  return { exitCode: 1, evidence: lastEvidence!, attempts };
}

// Entry-point guard so tests can import without invoking process.exit.
if (import.meta.main) {
  const baseURL = process.env.SMOKE_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL;
  const secret = process.env.HEALTH_CHECK_SECRET;
  if (!baseURL || !secret) {
    console.error(
      JSON.stringify({ ok: false, reason: "missing SMOKE_BASE_URL or HEALTH_CHECK_SECRET" }),
    );
    process.exit(1);
  }
  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? DEFAULT_SMOKE_TIMEOUT_MS);
  const result = await runSmoke({ baseURL, secret, timeoutMs });
  console.log(JSON.stringify({ ...result.evidence, attempts: result.attempts }, null, 2));
  process.exit(result.exitCode);
}

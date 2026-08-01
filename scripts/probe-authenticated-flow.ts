#!/usr/bin/env bun
/**
 * scripts/probe-authenticated-flow.ts
 *
 * End-to-end authenticated production probe. Signs in with a real Supabase
 * user, exercises onboarding + daily-mission server functions, and asserts
 * the client-issued correlation_id appears in both debug tables. Never
 * forges a session, never bypasses RLS.
 *
 * Exit codes:
 *   0 — every checkpoint verified
 *   1 — a checkpoint failed with structured evidence
 *   2 — environment cannot support the probe (NOT_VERIFIABLE)
 *
 * Required env:
 *   SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY   (or SUPABASE_ANON_KEY)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   E2E_TEST_EMAIL
 *   E2E_TEST_PASSWORD
 *   E2E_BASE_URL
 *   ONBOARDING_DEBUG_ENABLED=true
 *   DAILY_MISSION_DEBUG_ENABLED=true
 *
 * Optional env:
 *   AUTH_FLOW_TIMEOUT_MS       total wall-clock budget, default 60000
 *   STEP_TIMEOUT_MS            per-step timeout,          default 20000
 */
import { randomUUID } from "node:crypto";

export const DEFAULT_AUTH_FLOW_TIMEOUT_MS = 60_000;
export const DEFAULT_STEP_TIMEOUT_MS = 20_000;
export const RETRY_DELAYS_MS = [500, 1000, 2000];

export type Checkpoint =
  | "auth.sign_in.started"
  | "auth.sign_in.completed"
  | "onboarding.started"
  | "onboarding.completed"
  | "mission.started"
  | "mission.completed"
  | "debug_events.query.started"
  | "debug_events.query.completed";

export interface FailureEvidence {
  step: Checkpoint | string;
  timestamp: string;
  correlation_id: string | null;
  endpoint: string | null;
  status: number | null;
  duration_ms: number;
  error: string;
  response_body_summary: string | null;
  attempts?: AttemptRecord[];
}

export interface AttemptRecord {
  attempt: number;
  status: number | null;
  duration_ms: number;
  error: string | null;
  classification: "transient" | "permanent" | "ok";
}

export function classifyError(input: {
  status?: number | null;
  error?: unknown;
}): "transient" | "permanent" {
  const status = input.status ?? null;
  if (status !== null) {
    if (status >= 500) return "transient";
    if (status === 408 || status === 429) return "transient";
    return "permanent"; // 4xx: invalid creds, permissions, schema
  }
  const msg = String(
    (input.error as Error | undefined)?.message ?? input.error ?? "",
  ).toLowerCase();
  if (
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("fetch failed")
  ) {
    return "transient";
  }
  return "permanent";
}

export function buildFailureEvidence(input: {
  step: string;
  correlation_id: string | null;
  endpoint?: string | null;
  status?: number | null;
  duration_ms: number;
  error: unknown;
  body?: unknown;
  attempts?: AttemptRecord[];
}): FailureEvidence {
  let summary: string | null = null;
  if (input.body !== undefined && input.body !== null) {
    try {
      const s = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      summary = s.length > 500 ? s.slice(0, 500) + "…" : s;
    } catch {
      summary = "[unserialisable body]";
    }
  }
  return {
    step: input.step,
    timestamp: new Date().toISOString(),
    correlation_id: input.correlation_id,
    endpoint: input.endpoint ?? null,
    status: input.status ?? null,
    duration_ms: input.duration_ms,
    error: String((input.error as Error | undefined)?.message ?? input.error ?? "unknown"),
    response_body_summary: summary,
    attempts: input.attempts,
  };
}

export interface RetryOptions {
  delaysMs?: number[];
  sleepImpl?: (ms: number) => Promise<void>;
  stepTimeoutMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Runs `fn` with retries for transient failures. `fn` may return `{ status, error }`;
 * a non-null `error` or status classified as transient is retried.
 */
export async function withRetry<T extends { status?: number | null; error?: unknown }>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<{ result: T | null; attempts: AttemptRecord[] }> {
  const delays = opts.delaysMs ?? RETRY_DELAYS_MS;
  const sleep = opts.sleepImpl ?? defaultSleep;
  const maxAttempts = delays.length + 1;
  const attempts: AttemptRecord[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    let result: T | null = null;
    let thrown: unknown = null;
    try {
      result = await fn(attempt);
    } catch (err) {
      thrown = err;
    }
    const duration_ms = Date.now() - started;
    const status = result?.status ?? null;
    const err = thrown ?? result?.error ?? null;
    const ok = !err && (status === null || (status >= 200 && status < 400));
    const classification: AttemptRecord["classification"] = ok
      ? "ok"
      : classifyError({ status, error: err });
    attempts.push({
      attempt,
      status,
      duration_ms,
      error: err ? String((err as Error).message ?? err) : null,
      classification,
    });

    if (ok) return { result, attempts };
    if (classification === "permanent") return { result, attempts };
    if (attempt >= maxAttempts) return { result, attempts };
    await sleep(delays[attempt - 1]);
  }
  return { result: null, attempts };
}

// -- runtime entry point ----------------------------------------------------

if (import.meta.main)
  await (async () => {
    const { createClient } = await import("@supabase/supabase-js");

    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    const base = process.env.E2E_BASE_URL;
    const stepTimeoutMs = Number(process.env.STEP_TIMEOUT_MS ?? DEFAULT_STEP_TIMEOUT_MS);
    const flowTimeoutMs = Number(process.env.AUTH_FLOW_TIMEOUT_MS ?? DEFAULT_AUTH_FLOW_TIMEOUT_MS);

    const missing = Object.entries({
      SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service,
      E2E_TEST_EMAIL: email,
      E2E_TEST_PASSWORD: password,
      E2E_BASE_URL: base,
    })
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      console.log(JSON.stringify({ status: "NOT_VERIFIABLE", missing }, null, 2));
      process.exit(2);
    }

    const correlation_id = randomUUID();
    const evidence: Record<string, unknown> = { correlation_id, checkpoints: [] as string[] };
    const checkpoints = evidence.checkpoints as string[];
    const cp = (name: Checkpoint) => {
      checkpoints.push(`${name}@${new Date().toISOString()}`);
    };

    const flowStart = Date.now();
    const flowGuard = setTimeout(() => {
      console.error(
        JSON.stringify(
          buildFailureEvidence({
            step: "flow.timeout",
            correlation_id,
            duration_ms: Date.now() - flowStart,
            error: `AUTH_FLOW_TIMEOUT_MS (${flowTimeoutMs}) exceeded`,
          }),
        ),
      );
      process.exit(1);
    }, flowTimeoutMs);

    async function fail(step: string, extra: Partial<Parameters<typeof buildFailureEvidence>[0]>) {
      clearTimeout(flowGuard);
      console.error(
        JSON.stringify(
          buildFailureEvidence({
            step,
            correlation_id,
            duration_ms: Date.now() - flowStart,
            error: "step failed",
            ...extra,
          }),
          null,
          2,
        ),
      );
      process.exit(1);
    }

    try {
      cp("auth.sign_in.started");
      const user = createClient(url!, anon!, { auth: { persistSession: false } });
      const signInRes = await withRetry(async () => {
        const { data, error } = await user.auth.signInWithPassword({
          email: email!,
          password: password!,
        });
        // Auth errors from Supabase (invalid credentials) are permanent.
        return { status: error ? 401 : 200, error, data } as {
          status: number;
          error: unknown;
          data: typeof data;
        };
      });
      const signIn = signInRes.result;
      if (!signIn || signIn.error || !signIn.data.session) {
        return fail("auth.sign_in", {
          endpoint: `${url}/auth/v1/token`,
          status: signIn?.status ?? null,
          error: signIn?.error ?? "no session",
          attempts: signInRes.attempts,
        });
      }
      cp("auth.sign_in.completed");
      const token = signIn.data.session.access_token;
      const userId = signIn.data.user!.id;

      async function callFn(step: Checkpoint, path: string, body: unknown) {
        const endpoint = `${base}${path}`;
        const res = await withRetry(
          async () => {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), stepTimeoutMs);
            try {
              const r = await fetch(endpoint, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
              });
              const text = await r.text();
              let parsed: unknown = text;
              try {
                parsed = JSON.parse(text);
              } catch {
                /* non-JSON body */
              }
              return { status: r.status, error: r.ok ? null : `http_${r.status}`, body: parsed };
            } finally {
              clearTimeout(t);
            }
          },
          { stepTimeoutMs },
        );
        if (!res.result || res.result.error) {
          await fail(step, {
            endpoint,
            status: res.result?.status ?? null,
            error: res.result?.error ?? "no response",
            body: res.result?.body,
            attempts: res.attempts,
          });
          return { status: 0, body: null };
        }
        return { status: res.result.status, body: res.result.body };
      }

      cp("onboarding.started");
      const onb = await callFn("onboarding.started", "/_serverFn/completeOnboardingFn", {
        data: { correlationId: correlation_id },
      });
      evidence.onboarding = onb.status === 200;
      cp("onboarding.completed");

      cp("mission.started");
      const mission = await callFn("mission.started", "/_serverFn/generateDailyMissionFn", {
        data: { correlationId: correlation_id },
      });
      evidence.mission = mission.status === 200;
      cp("mission.completed");

      cp("debug_events.query.started");
      const admin = createClient(url!, service!, { auth: { persistSession: false } });
      const { data: profile } = await admin
        .from("profiles")
        .select("onboarded_at")
        .eq("id", userId)
        .maybeSingle();
      evidence.profile_onboarded_at = profile?.onboarded_at ?? null;

      const { data: onbEvents } = await admin
        .from("onboarding_debug_events")
        .select("id,event_name")
        .eq("correlation_id", correlation_id);
      const { data: missionEvents } = await admin
        .from("daily_mission_debug_events")
        .select("id,event_name")
        .eq("correlation_id", correlation_id);
      evidence.onboarding_events = onbEvents?.length ?? 0;
      evidence.mission_events = missionEvents?.length ?? 0;
      evidence.db_events = (onbEvents?.length ?? 0) > 0 && (missionEvents?.length ?? 0) > 0;
      cp("debug_events.query.completed");

      clearTimeout(flowGuard);
      console.log(JSON.stringify(evidence, null, 2));
      const ok =
        evidence.onboarding === true && evidence.mission === true && evidence.db_events === true;
      process.exit(ok ? 0 : 1);
    } catch (err) {
      await fail("flow.unhandled", {
        error: err,
        duration_ms: Date.now() - flowStart,
      });
    }
  })();

import { describe, it, expect } from "vitest";
import { runSmoke, isRetryableStatus, isNonRetryableStatus } from "../../../scripts/smoke-worker";

const noSleep = async () => {};

function makeFetch(responders: Array<() => Promise<Response> | Response>): {
  fetch: typeof globalThis.fetch;
  calls: number;
} {
  let i = 0;
  const state = { calls: 0 };
  const fn = (async () => {
    state.calls++;
    const responder = responders[Math.min(i, responders.length - 1)];
    i++;
    return await responder();
  }) as unknown as typeof globalThis.fetch;
  return { fetch: fn, calls: 0, get: () => state.calls };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const HEALTHY = {
  status: "healthy",
  checks: { supabase_db: { status: "ok" }, supabase_auth: { status: "ok" } },
};

describe("smoke-worker retry policy", () => {
  it("classifies 502/503/504 as retryable and 401/403/404 as not", () => {
    for (const s of [502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
    for (const s of [401, 403, 404]) expect(isNonRetryableStatus(s)).toBe(true);
    expect(isRetryableStatus(200)).toBe(false);
    expect(isNonRetryableStatus(500)).toBe(false);
  });

  it("retries on 503 and returns success on eventual 200", async () => {
    const responders = [
      () => jsonResponse(503, {}),
      () => jsonResponse(503, {}),
      () => jsonResponse(200, HEALTHY),
    ];
    let call = 0;
    const fetchImpl = (async () => responders[call++]()) as unknown as typeof fetch;
    const result = await runSmoke({
      baseURL: "http://x",
      secret: "s",
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(result.exitCode).toBe(0);
    expect(result.attempts.length).toBe(3);
    expect(result.evidence.retry_count).toBe(2);
    expect(result.evidence.supabase_status).toBe("ok");
  });

  it("retries on network timeout (AbortError) then fails after exhaustion", async () => {
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      // Simulate abort: reject with AbortError
      return await new Promise((_res, rej) => {
        init?.signal?.addEventListener?.("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          rej(e);
        });
        // Never resolve; only abort path fires.
      });
    }) as unknown as typeof fetch;

    const result = await runSmoke({
      baseURL: "http://x",
      secret: "s",
      fetchImpl,
      sleepImpl: noSleep,
      timeoutMs: 1,
    });
    expect(result.exitCode).toBe(1);
    expect(result.attempts.length).toBe(4); // 1 + 3 retries
    expect(result.evidence.failure_reason).toBe("timeout");
    expect(result.evidence.retry_count).toBe(3);
  });

  it("does NOT retry on 401", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return jsonResponse(401, { status: "unauthorized" });
    }) as unknown as typeof fetch;
    const result = await runSmoke({
      baseURL: "http://x",
      secret: "s",
      fetchImpl,
      sleepImpl: noSleep,
    });
    expect(result.exitCode).toBe(1);
    expect(calls).toBe(1);
    expect(result.evidence.status).toBe(401);
    expect(result.evidence.failure_reason).toBe("http_401");
  });

  it("emits structured evidence with all required fields", async () => {
    const fetchImpl = (async () => jsonResponse(200, HEALTHY)) as any;
    const result = await runSmoke({
      baseURL: "http://x/",
      secret: "s",
      fetchImpl,
      sleepImpl: noSleep,
    });
    const e = result.evidence;
    expect(e).toMatchObject({
      endpoint: "http://x/api/healthz",
      attempt: 1,
      status: 200,
      retry_count: 0,
      health_status: "healthy",
      supabase_status: "ok",
      failure_reason: null,
    });
    expect(typeof e.latency_ms).toBe("number");
    expect(typeof e.timestamp).toBe("string");
  });
});

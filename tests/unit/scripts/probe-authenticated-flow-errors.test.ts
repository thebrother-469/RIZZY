import { describe, it, expect } from "vitest";
import {
  classifyError,
  buildFailureEvidence,
  withRetry,
} from "../../../scripts/probe-authenticated-flow";

const noSleep = async () => {};

describe("probe-authenticated-flow reliability helpers", () => {
  it("classifyError treats 5xx / timeout / network as transient", () => {
    expect(classifyError({ status: 500 })).toBe("transient");
    expect(classifyError({ status: 503 })).toBe("transient");
    expect(classifyError({ status: 429 })).toBe("transient");
    expect(classifyError({ error: new Error("fetch failed") })).toBe("transient");
    expect(classifyError({ error: new Error("network timeout") })).toBe("transient");
  });

  it("classifyError treats 4xx / permissions / schema as permanent", () => {
    expect(classifyError({ status: 401 })).toBe("permanent");
    expect(classifyError({ status: 403 })).toBe("permanent");
    expect(classifyError({ status: 400 })).toBe("permanent");
    expect(classifyError({ error: new Error("permission denied") })).toBe("permanent");
  });

  it("buildFailureEvidence preserves correlation_id and summarises body", () => {
    const cid = "cid-123";
    const ev = buildFailureEvidence({
      step: "onboarding.started",
      correlation_id: cid,
      endpoint: "/x",
      status: 500,
      duration_ms: 42,
      error: new Error("boom"),
      body: { a: "b" },
    });
    expect(ev.correlation_id).toBe(cid);
    expect(ev.step).toBe("onboarding.started");
    expect(ev.status).toBe(500);
    expect(ev.duration_ms).toBe(42);
    expect(ev.error).toBe("boom");
    expect(ev.response_body_summary).toContain('"a"');
    expect(ev.timestamp).toMatch(/T/);
  });

  it("buildFailureEvidence truncates large bodies", () => {
    const huge = "x".repeat(2000);
    const ev = buildFailureEvidence({
      step: "s",
      correlation_id: "c",
      duration_ms: 0,
      error: "e",
      body: huge,
    });
    expect(ev.response_body_summary!.length).toBeLessThanOrEqual(501);
    expect(ev.response_body_summary!.endsWith("…")).toBe(true);
  });

  it("withRetry retries transient failures then succeeds", async () => {
    let n = 0;
    const { result, attempts } = await withRetry(
      async () => {
        n++;
        if (n < 3) return { status: 503, error: "svc" };
        return { status: 200, error: null };
      },
      { sleepImpl: noSleep },
    );
    expect(result?.status).toBe(200);
    expect(attempts.length).toBe(3);
    expect(attempts[0].classification).toBe("transient");
    expect(attempts[2].classification).toBe("ok");
  });

  it("withRetry does not retry permanent failures", async () => {
    let n = 0;
    const { result, attempts } = await withRetry(
      async () => {
        n++;
        return { status: 401, error: "invalid credentials" };
      },
      { sleepImpl: noSleep },
    );
    expect(n).toBe(1);
    expect(attempts.length).toBe(1);
    expect(attempts[0].classification).toBe("permanent");
    expect(result?.status).toBe(401);
  });

  it("withRetry exhausts retries and returns final attempts", async () => {
    let n = 0;
    const { attempts } = await withRetry(
      async () => {
        n++;
        return { status: 502, error: "bad gateway" };
      },
      { sleepImpl: noSleep },
    );
    expect(attempts.length).toBe(4); // 1 + 3 retries
    expect(n).toBe(4);
    for (const a of attempts) expect(a.classification).toBe("transient");
  });

  it("withRetry treats thrown network errors as transient", async () => {
    let n = 0;
    const { attempts } = await withRetry(
      async () => {
        n++;
        throw new Error("fetch failed");
      },
      { sleepImpl: noSleep },
    );
    expect(attempts.length).toBe(4);
    expect(attempts.every((a) => a.classification === "transient")).toBe(true);
  });
});

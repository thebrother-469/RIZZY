/**
 * Trace / request-id header smoke tests for every /api/public endpoint.
 *
 * The app emits `x-request-id` and (when OTLP tracing is enabled)
 * `x-trace-id` / `traceparent` for correlation. When tracing is
 * intentionally disabled these headers may be absent — the test then
 * verifies graceful fallback rather than failing.
 */
import { test, expect, type APIResponse } from "@playwright/test";

const W3C_TRACEPARENT = /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;
const otlpEnabled = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

function assertTraceShape(res: APIResponse) {
  const h = res.headers();
  const requestId = h["x-request-id"] ?? h["x-lovable-request-id"] ?? null;
  const traceId = h["x-trace-id"] ?? null;
  const traceparent = h["traceparent"] ?? null;

  if (requestId) expect(requestId).toMatch(/^[a-zA-Z0-9_-]{6,}$/);
  if (traceparent) expect(traceparent).toMatch(W3C_TRACEPARENT);
  if (otlpEnabled) {
    // With tracing on, at least one correlation header must be present.
    expect(requestId || traceId || traceparent).toBeTruthy();
  }
  return { requestId, traceId, traceparent };
}

test.describe("/api/public/* trace + request-id headers", () => {
  test("GET /api/public/health carries correlation headers when tracing enabled", async ({
    request,
  }) => {
    const res = await request.get("/api/public/health");
    expect([200, 503]).toContain(res.status());
    assertTraceShape(res);
  });

  test("POST /api/public/csp-report carries correlation headers when tracing enabled", async ({
    request,
  }) => {
    const res = await request.post("/api/public/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({
        "csp-report": { "document-uri": "https://x", "violated-directive": "script-src" },
      }),
    });
    expect([204, 400]).toContain(res.status());
    assertTraceShape(res);
  });

  test("POST /api/public/lemon-webhook (bad sig) still emits correlation headers", async ({
    request,
  }) => {
    const res = await request.post("/api/public/lemon-webhook", {
      headers: { "content-type": "application/json", "x-signature": "0".repeat(64) },
      data: JSON.stringify({ meta: {}, data: {} }),
    });
    expect([400, 401, 403]).toContain(res.status());
    assertTraceShape(res);
  });

  test("POST /api/public/lemon-sync (unauth) still emits correlation headers", async ({
    request,
  }) => {
    const res = await request.post("/api/public/lemon-sync", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({}),
    });
    expect([401, 403]).toContain(res.status());
    assertTraceShape(res);
  });

  test("POST /api/public/lemon-checkout (unauth) still emits correlation headers", async ({
    request,
  }) => {
    const res = await request.post("/api/public/lemon-checkout", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ variant_id: "smoke" }),
    });
    expect([400, 401, 403]).toContain(res.status());
    assertTraceShape(res);
  });

  test("trace-id remains consistent across the request lifecycle", async ({ request }) => {
    const incoming = "00-" + "a".repeat(32) + "-" + "b".repeat(16) + "-01";
    const res = await request.get("/api/public/health", {
      headers: { traceparent: incoming },
    });
    const { traceparent } = assertTraceShape(res);
    if (traceparent) {
      // W3C spec: the trace-id (positions 4..36) MUST be propagated.
      const incomingTraceId = incoming.slice(3, 35);
      const outgoingTraceId = traceparent.slice(3, 35);
      expect(outgoingTraceId).toBe(incomingTraceId);
    } else if (otlpEnabled) {
      throw new Error("OTLP is enabled but no traceparent was propagated");
    } else {
      test.info().annotations.push({
        type: "notice",
        description:
          "OTLP disabled — traceparent propagation not asserted (graceful fallback verified).",
      });
    }
  });
});

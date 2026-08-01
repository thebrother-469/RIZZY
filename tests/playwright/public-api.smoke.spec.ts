/**
 * Public API smoke tests. Verifies the /api/public/* surface returns
 * the expected status codes, rejects invalid/missing auth, handles
 * malformed payloads, and emits the security headers we ship.
 */
import { test, expect } from "@playwright/test";

test.describe("/api/public/* smoke", () => {
  test("GET /api/public/health returns minimal JSON to public callers", async ({ request }) => {
    const res = await request.get("/api/public/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    // Detailed checks must not leak without the shared secret.
    expect(body).not.toHaveProperty("checks");
  });

  test("GET /api/public/health with wrong secret still hides diagnostics", async ({ request }) => {
    const res = await request.get("/api/public/health", {
      headers: { "x-health-secret": "definitely-not-the-secret" },
    });
    const body = await res.json();
    expect(body).not.toHaveProperty("checks");
  });

  test("POST /api/public/csp-report accepts a valid report (204)", async ({ request }) => {
    const res = await request.post("/api/public/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: JSON.stringify({
        "csp-report": { "document-uri": "https://x", "violated-directive": "script-src" },
      }),
    });
    expect(res.status()).toBe(204);
  });

  test("POST /api/public/csp-report silently ignores malformed JSON", async ({ request }) => {
    const res = await request.post("/api/public/csp-report", {
      headers: { "content-type": "application/csp-report" },
      data: "not-json",
    });
    expect([204, 400]).toContain(res.status());
  });

  test("POST /api/public/lemon-webhook rejects missing signature", async ({ request }) => {
    const res = await request.post("/api/public/lemon-webhook", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ meta: {}, data: {} }),
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test("POST /api/public/lemon-webhook rejects bad signature", async ({ request }) => {
    const res = await request.post("/api/public/lemon-webhook", {
      headers: {
        "content-type": "application/json",
        "x-signature": "0".repeat(64),
      },
      data: JSON.stringify({ meta: {}, data: {} }),
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test("POST /api/public/lemon-sync rejects unauthenticated caller", async ({ request }) => {
    const res = await request.post("/api/public/lemon-sync", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({}),
    });
    expect([401, 403]).toContain(res.status());
  });

  test("POST /api/public/lemon-checkout rejects unauthenticated caller", async ({ request }) => {
    const res = await request.post("/api/public/lemon-checkout", {
      headers: { "content-type": "application/json" },
      data: JSON.stringify({ variant_id: "not-a-variant" }),
    });
    expect([400, 401, 403]).toContain(res.status());
  });

  test("GET / carries baseline security headers", async ({ request }) => {
    const res = await request.get("/");
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(
      headers["content-security-policy"] || headers["content-security-policy-report-only"],
    ).toBeTruthy();
  });
});

/**
 * /api/healthz contract tests.
 *
 * The existing endpoint (src/lib/healthz.ts) authenticates via an
 * x-health-secret header — the "existing project standard" the directive
 * defers to when already implemented. These tests verify:
 *   • Missing secret → detail is hidden (no secret leakage) but status still emits
 *   • Wrong secret → detail hidden
 *   • Correct secret → structured payload with checks + no secret values in body
 */
import { describe, it, expect, beforeAll } from "vitest";
import { handleHealthz } from "../../src/lib/healthz";

const SECRET = "test-health-secret-xyz";

beforeAll(() => {
  process.env.HEALTH_CHECK_SECRET = SECRET;
  // Force env-check into a known state without leaking real secrets.
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY ??= "pk_test";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "sr_test";
});

async function call(headers: Record<string, string> = {}) {
  const req = new Request("http://localhost/api/healthz", { method: "GET", headers });
  const res = await handleHealthz(req);
  const body = await res.json();
  return { res, body };
}

describe("/api/healthz", () => {
  it("returns minimal body without secret (unauthorized)", async () => {
    const { body } = await call();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("timestamp");
    // Redacted view must not expose checks/env/versions.
    expect(body).not.toHaveProperty("checks");
    expect(body).not.toHaveProperty("environment");
  });

  it("returns minimal body with wrong secret", async () => {
    const { body } = await call({ "x-health-secret": "wrong" });
    expect(body).not.toHaveProperty("checks");
  });

  it("returns detailed structured body when secret matches", async () => {
    const { res, body } = await call({ "x-health-secret": SECRET });
    expect([200, 503]).toContain(res.status);
    expect(body).toHaveProperty("checks");
    expect(body.checks).toHaveProperty("ssr", "ok");
    expect(body.checks).toHaveProperty("env");
    expect(body.checks).toHaveProperty("supabase_db");
    expect(body.checks).toHaveProperty("supabase_auth");
    // Never leak secret values.
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain(process.env.SUPABASE_SERVICE_ROLE_KEY!);
  });

  it("never echoes the HEALTH_CHECK_SECRET back in headers", async () => {
    const { res } = await call({ "x-health-secret": SECRET });
    for (const [, v] of res.headers) {
      expect(v).not.toContain(SECRET);
    }
  });
});

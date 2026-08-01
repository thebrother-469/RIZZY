import { describe, it, expect } from "vitest";
import { buildHydrationReport } from "@/lib/hydration-diagnostics";

const FORBIDDEN = [
  "eyJhbGciOi", // JWT payload prefix
  "sb_secret_ABCDEFGHIJKLMNOP",
  "sb_publishable_ZZZZZZZZZZZZZ",
  "secretbearertokenvalue",
  "sb-project-auth-token=abcdefg",
  "session=xyz",
  "service_role_key_value",
  "LEMONSQUEEZY_API_KEY_VALUE",
  "LEMONSQUEEZY_WEBHOOK_SECRET_VALUE",
  "LEMONSQUEEZY_STORE_ID_VALUE",
  "SUPABASE_SERVICE_ROLE_KEY_VALUE",
  "hunter2",
  "lmsq_ABCDEFGHIJKLMNOPQRST",
];

describe("hydration diagnostics — redaction contract", () => {
  it("emits exactly the required fields and no extras", () => {
    const err = new Error("Minified React error #418; visit reactjs.org/docs/error-decoder");
    const report = buildHydrationReport(err, {
      pathname: "/pricing",
      buildId: "abc123",
      now: new Date("2026-07-15T00:00:00Z"),
    });

    // Required fields present.
    expect(report.route).toBe("/pricing");
    expect(report.pathname).toBe("/pricing");
    expect(report.renderingContext).toBe("client");
    expect(report.buildId).toBe("abc123");
    expect(report.hydrationErrorCode).toBe("#418");
    expect(report.timestamp).toBe("2026-07-15T00:00:00.000Z");
    expect(report.kind).toBe("hydration_mismatch");

    // Never carries a stack.
    expect(report).not.toHaveProperty("stack");
    // Never carries React props / raw children.
    expect(report).not.toHaveProperty("props");
    expect(report).not.toHaveProperty("children");
    // Never carries headers / cookies / storage.
    for (const forbidden of [
      "headers",
      "cookies",
      "authorization",
      "localStorage",
      "sessionStorage",
    ]) {
      expect(report).not.toHaveProperty(forbidden);
    }
  });

  it("redacts every known secret pattern that could appear in the error message", () => {
    // Seed process.env with fake values so runtime redaction is exercised.
    process.env.LEMONSQUEEZY_API_KEY = "LEMONSQUEEZY_API_KEY_VALUE";
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "LEMONSQUEEZY_WEBHOOK_SECRET_VALUE";
    process.env.LEMONSQUEEZY_STORE_ID = "LEMONSQUEEZY_STORE_ID_VALUE";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY_VALUE";

    const nasty = [
      "#418 Hydration mismatch;",
      "JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      "key=sb_secret_ABCDEFGHIJKLMNOP",
      "pub=sb_publishable_ZZZZZZZZZZZZZ",
      "Authorization: Bearer secretbearertokenvalue",
      "Cookie: sb-project-auth-token=abcdefg",
      "Set-Cookie: session=xyz",
      'creds={"password":"hunter2"} password=hunter2',
      "service_role=service_role_key_value_abcdefghij",
      "lmsq_ABCDEFGHIJKLMNOPQRST",
      "LEMONSQUEEZY_API_KEY_VALUE",
      "SUPABASE_SERVICE_ROLE_KEY_VALUE",
      "LEMONSQUEEZY_WEBHOOK_SECRET_VALUE",
      "LEMONSQUEEZY_STORE_ID_VALUE",
    ].join(" | ");

    const err = new Error(nasty);
    const report = buildHydrationReport(err, { pathname: "/", buildId: "b1" });

    const serialized = JSON.stringify(report);
    for (const bad of FORBIDDEN) {
      expect(serialized, `leak: ${bad}`).not.toContain(bad);
    }
    // Hydration code still recoverable.
    expect(report.hydrationErrorCode).toBe("#418");
  });

  it("never includes raw stack traces", () => {
    const err = new Error("hydration");
    err.stack =
      "Error: hydration\n    at Foo (secretbearertokenvalue)\n    Cookie: sb-project-auth-token=leak";
    const report = buildHydrationReport(err, { pathname: "/x" });
    expect(JSON.stringify(report)).not.toContain("secretbearertokenvalue");
    expect(JSON.stringify(report)).not.toContain("sb-project-auth-token");
  });
});

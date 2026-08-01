import { describe, it, expect } from "vitest";
import { buildSupabaseInitFailureLog } from "@/integrations/supabase/init-logging";

const SECRET_VALUES = {
  LEMONSQUEEZY_API_KEY: "lemonapikey_ABCDEFGHIJKLMNOP",
  LEMONSQUEEZY_WEBHOOK_SECRET: "lemonwebhook_ABCDEFGHIJKL",
  LEMONSQUEEZY_STORE_ID: "storeid_ABCDEFGHIJKLMNOPQR",
  SUPABASE_SERVICE_ROLE_KEY: "servicerolekeyvalue_ABCDEFGHIJKL",
  SUPABASE_ANON_KEY: "anonkeyvalue_ABCDEFGHIJKLMNOP",
  LOVABLE_API_KEY: "lovableapikey_ABCDEFGHIJKLMNOP",
};

const FORBIDDEN_FRAGMENTS = [
  ...Object.values(SECRET_VALUES),
  "eyJ0eXAiOiJKV1QiLCJhbGc", // JWT header prefix
  "sb_secret_",
  "Bearer secret",
  "Cookie: session=",
  "Set-Cookie:",
  "sb-project-auth-token=abcdef",
  "refresh_token=abcdef",
  "access_token=abcdef",
  "hunter2Password",
];

function seedEnv() {
  for (const [k, v] of Object.entries(SECRET_VALUES)) process.env[k] = v;
}

describe("supabase SSR init logging", () => {
  it("emits every required field", () => {
    const err = new Error("boom");
    err.name = "TypeError";
    const log = buildSupabaseInitFailureLog(err, {
      environment: "ssr",
      buildId: "commit-sha-1",
      url: "https://example.com/",
      now: new Date("2026-07-15T00:00:00Z"),
    });
    expect(log.module).toBe("src/integrations/supabase/client.ts");
    expect(log.timestamp).toBe("2026-07-15T00:00:00.000Z");
    expect(log.route).toBe("https://example.com/");
    expect(log.environment).toBe("ssr");
    expect(log.buildId).toBe("commit-sha-1");
    expect(log.errorClass).toBe("TypeError");
    expect(typeof log.stack === "string" || log.stack === undefined).toBe(true);
    expect(log.supabaseHost).toMatch(/^[a-z0-9.-]+$/i);
  });

  it("redacts every listed secret from message and stack", () => {
    seedEnv();
    const nasty = [
      "connect failed:",
      `Authorization: Bearer ${SECRET_VALUES.LOVABLE_API_KEY}`,
      "Cookie: session=hunter2Password; sb-project-auth-token=abcdef",
      "Set-Cookie: refresh_token=abcdef; access_token=abcdef",
      `role=${SECRET_VALUES.SUPABASE_SERVICE_ROLE_KEY}`,
      "jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.payload.signature",
      `pubkey=sb_secret_${"X".repeat(20)}`,
      `apikey=${SECRET_VALUES.LEMONSQUEEZY_API_KEY}`,
      `webhook=${SECRET_VALUES.LEMONSQUEEZY_WEBHOOK_SECRET}`,
      `store=${SECRET_VALUES.LEMONSQUEEZY_STORE_ID}`,
    ].join(" | ");

    const err = new Error(nasty);
    err.stack = `Error: ${nasty}\n    at Object.<anonymous> (${nasty})`;

    const log = buildSupabaseInitFailureLog(err, {
      environment: "ssr",
      buildId: "b2",
    });
    const serialized = JSON.stringify(log);
    for (const bad of FORBIDDEN_FRAGMENTS) {
      expect(serialized, `leaked: ${bad}`).not.toContain(bad);
    }
  });

  it("does not accept or emit headers/cookies as separate fields", () => {
    const err = new Error("x");
    const log = buildSupabaseInitFailureLog(err, { environment: "browser" });
    for (const bad of ["headers", "cookies", "authorization", "session", "jwt", "token"]) {
      expect(log).not.toHaveProperty(bad);
    }
  });
});

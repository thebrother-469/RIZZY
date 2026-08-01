/**
 * E2E user synchronisation: credential-path coverage with injected env.
 * No live network calls in the missing-credential paths.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { missingCredentials, syncE2EUser } from "../../../scripts/create-e2e-user";

const BASE = {
  SUPABASE_URL: "https://example.supabase.co",
  E2E_TEST_USER_EMAIL: "e2e@example.com",
  E2E_TEST_USER_PASSWORD: "secret-password",
  SUPABASE_ANON_KEY: "anon-key",
};

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ status, ok: status < 400, json: async () => body })),
  );
}

describe("e2e user sync credential paths", () => {
  it("reports every missing credential name", () => {
    expect(missingCredentials({})).toEqual([
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "E2E_TEST_USER_EMAIL",
      "E2E_TEST_USER_PASSWORD",
    ]);
  });

  it("falls back to password login and PASSes when the account already exists", async () => {
    stubFetch(200, { access_token: "token", user: { id: "user-1" } });
    const res = await syncE2EUser(BASE);
    expect(res.status).toBe("PASS");
    expect(res.method).toBe("password-login");
    expect(res.action).toBe("unchanged");
    expect(res.userId).toBe("user-1");
  });

  it("reports NOT VERIFIED with an operator action when the fallback login fails", async () => {
    stubFetch(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
    const res = await syncE2EUser(BASE);
    expect(res.status).toBe("NOT VERIFIED");
    expect(res.errorCode).toBe("invalid_credentials");
    expect(res.operatorAction).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("never echoes the password or service key in its output", async () => {
    stubFetch(400, { error_code: "invalid_credentials", msg: "Invalid login credentials" });
    const res = await syncE2EUser({ ...BASE, SUPABASE_SERVICE_ROLE_KEY: undefined });
    expect(JSON.stringify(res)).not.toContain("secret-password");
  });

  it("reports NOT VERIFIED when no credentials at all are available", async () => {
    const res = await syncE2EUser({});
    expect(res.status).toBe("NOT VERIFIED");
    expect(res.method).toBe("none");
    expect(res.detail).toMatch(/Neither service credentials nor login credentials/);
  });
});

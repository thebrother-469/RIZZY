#!/usr/bin/env bun
/**
 * Creates a disposable (or the configured) Supabase Auth user for E2E runs.
 *
 *   bun run e2e:create-user                # syncs E2E_TEST_USER_EMAIL
 *   bun run e2e:create-user --disposable   # mints a fresh throwaway identity
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Without them the script
 * reports NOT VERIFIED and exits 0 so CI is never failed by absent secrets.
 * Credentials for a disposable user are printed once (they are throwaway and
 * required by the caller); the configured password is never printed.
 */
import { resolveEnv, missing, ensureUser, disposableIdentity } from "./e2e-env";

export async function createTestUser(disposable: boolean) {
  const e = resolveEnv();
  const need = missing(
    e,
    disposable ? ["url", "serviceKey"] : ["url", "serviceKey", "email", "password"],
  );
  if (need.length) {
    return {
      status: "NOT VERIFIED" as const,
      missing: need,
      detail: `Cannot create an Auth user; missing ${need.join(", ")}.`,
    };
  }
  const identity = disposable ? disposableIdentity() : { email: e.email!, password: e.password! };
  const result = await ensureUser(e, identity.email, identity.password);
  if (result.action === "none") {
    return {
      status: "FAIL" as const,
      missing: [],
      detail: `Auth admin call failed (HTTP ${result.status}).`,
    };
  }
  return {
    status: "PASS" as const,
    missing: [],
    action: result.action,
    userId: result.id,
    email: identity.email,
    ...(disposable ? { password: identity.password } : {}),
    detail: `Auth user ${result.action}.`,
  };
}

if (import.meta.main) {
  const res = await createTestUser(process.argv.includes("--disposable"));
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.status === "FAIL" ? 1 : 0);
}

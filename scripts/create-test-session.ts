#!/usr/bin/env bun
/**
 * Mints a real Supabase session for the E2E user and writes a Playwright
 * `storageState` file so browser contexts start authenticated with no UI
 * interaction.
 *
 *   bun run e2e:session                       # -> test-results/storage-state.json
 *   bun run e2e:session --out path.json
 *
 * Order of preference:
 *   1. A session already injected into the environment
 *      (LOVABLE_BROWSER_SUPABASE_SESSION_JSON).
 *   2. Password grant with E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD,
 *      after ensuring the account exists when a service key is bound.
 *
 * Tokens are written to disk for Playwright but never logged.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  resolveEnv,
  passwordSignIn,
  ensureUser,
  storageStateFor,
  supabaseStorageKey,
  type AuthSession,
} from "./e2e-env";

const DEFAULT_OUT = "test-results/storage-state.json";

export async function createTestSession(outPath = DEFAULT_OUT) {
  const e = resolveEnv();
  const origin =
    process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";
  const storageKey = supabaseStorageKey(e);

  const injected = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  let session: AuthSession | null = null;
  let source: "injected" | "password-grant" | "none" = "none";

  if (injected) {
    try {
      session = JSON.parse(injected) as AuthSession;
      source = "injected";
    } catch {
      session = null;
    }
  }

  if (!session) {
    if (e.serviceKey && e.email && e.password) await ensureUser(e, e.email, e.password);
    const grant = await passwordSignIn(e);
    if (grant.session) {
      session = grant.session;
      source = "password-grant";
    } else {
      return {
        status: "NOT VERIFIED" as const,
        source,
        detail:
          `Could not mint a session (HTTP ${grant.status}${grant.errorCode ? `, ${grant.errorCode}` : ""}). ` +
          `Bind SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and E2E_TEST_USER_EMAIL/PASSWORD ` +
          `(plus SUPABASE_SERVICE_ROLE_KEY to auto-provision the account).`,
      };
    }
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(storageStateFor(origin, storageKey, session), null, 2));
  return {
    status: "PASS" as const,
    source,
    out: outPath,
    origin,
    userId: session.user?.id,
    detail: "Playwright storageState written with a live Supabase session.",
  };
}

if (import.meta.main) {
  const idx = process.argv.indexOf("--out");
  const res = await createTestSession(idx > -1 ? process.argv[idx + 1] : DEFAULT_OUT);
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

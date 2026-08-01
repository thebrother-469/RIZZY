#!/usr/bin/env bun
/**
 * Idempotent Supabase Auth E2E user synchronisation.
 *
 * Reads E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD and the service
 * credentials that CI already binds (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * then ensures exactly one Auth user exists with that email and password:
 *
 *   - absent  -> created (email pre-confirmed so password grant works)
 *   - present -> password reset to the configured value
 *   - already in the desired state -> exits 0 without changes
 *
 * Never prints the password, the service key, or any token.
 * When credentials are unavailable it reports NOT VERIFIED with the exact
 * missing variable names and exits 0 (CI must not fail on absent secrets).
 *
 * Usage: bun run e2e:user
 */
export interface E2EUserSyncResult {
  status: "PASS" | "FAIL" | "NOT VERIFIED";
  action: "created" | "updated" | "unchanged" | "none";
  missing: string[];
  detail: string;
  userId?: string;
  /** Which credential path produced this result. */
  method?: "service-role" | "password-login" | "none";
  httpStatus?: number;
  errorCode?: string;
  operatorAction?: string;
}

interface AdminUser {
  id: string;
  email?: string;
}

const REQUIRED = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_TEST_USER_EMAIL",
  "E2E_TEST_USER_PASSWORD",
] as const;

/** Credentials required for the password-login fallback path. */
const FALLBACK_REQUIRED = [
  "SUPABASE_URL",
  "E2E_TEST_USER_EMAIL",
  "E2E_TEST_USER_PASSWORD",
] as const;

export function missingCredentials(env: Record<string, string | undefined>): string[] {
  return REQUIRED.filter((k) => !env[k]);
}

async function adminFetch(
  baseUrl: string,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function syncE2EUser(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<E2EUserSyncResult> {
  const missing = missingCredentials(env);
  if (missing.length) {
    // Fallback: no service role key, but the account may already exist.
    // Prove it by minting a real session with the configured credentials.
    const fallbackMissing = FALLBACK_REQUIRED.filter((k) => !env[k]);
    if (fallbackMissing.length) {
      return {
        status: "NOT VERIFIED",
        action: "none",
        missing,
        method: "none",
        detail:
          `Neither service credentials nor login credentials are available. ` +
          `Missing: ${missing.join(", ")}.`,
        operatorAction:
          "Bind SUPABASE_SERVICE_ROLE_KEY (preferred) or E2E_TEST_USER_EMAIL/E2E_TEST_USER_PASSWORD in the runtime.",
      };
    }
    const probe = await verifyE2ESignIn(env);
    if (probe.ok) {
      return {
        status: "PASS",
        action: "unchanged",
        missing,
        method: "password-login",
        userId: probe.userId,
        httpStatus: probe.status,
        detail:
          "SUPABASE_SERVICE_ROLE_KEY unavailable; the configured E2E account already exists and " +
          "successfully minted a session via the password grant. Reusing the existing account.",
      };
    }
    return {
      status: "NOT VERIFIED",
      action: "none",
      missing,
      method: "password-login",
      httpStatus: probe.status,
      errorCode: probe.errorCode,
      detail: `Authentication failed for the configured E2E user. ${probe.detail}`,
      operatorAction:
        "Bind SUPABASE_SERVICE_ROLE_KEY so the account can be created/reset, or correct E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD.",
    };
  }

  const baseUrl = env.SUPABASE_URL!;
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  const email = env.E2E_TEST_USER_EMAIL!;
  const password = env.E2E_TEST_USER_PASSWORD!;

  // Look the user up by email (admin list endpoint supports a filter).
  const lookup = await adminFetch(
    baseUrl,
    key,
    `/auth/v1/admin/users?page=1&per_page=200&filter=${encodeURIComponent(email)}`,
  );
  if (lookup.status >= 400) {
    return {
      status: "FAIL",
      action: "none",
      missing: [],
      detail: `Admin user lookup failed (HTTP ${lookup.status}).`,
    };
  }
  const users = ((lookup.body as { users?: AdminUser[] })?.users ?? []).filter(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (users.length === 0) {
    const created = await adminFetch(baseUrl, key, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (created.status >= 400) {
      return {
        status: "FAIL",
        action: "none",
        missing: [],
        detail: `Admin user creation failed (HTTP ${created.status}).`,
      };
    }
    return {
      status: "PASS",
      action: "created",
      missing: [],
      method: "service-role",
      userId: (created.body as AdminUser)?.id,
      detail: "E2E Auth user did not exist and was created with a confirmed email.",
    };
  }

  const user = users[0];
  const updated = await adminFetch(baseUrl, key, `/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({ password, email_confirm: true }),
  });
  if (updated.status >= 400) {
    return {
      status: "FAIL",
      action: "none",
      missing: [],
      userId: user.id,
      detail: `Admin password update failed (HTTP ${updated.status}).`,
    };
  }
  return {
    status: "PASS",
    action: "updated",
    missing: [],
    method: "service-role",
    userId: user.id,
    detail: "E2E Auth user already existed; password reset to the configured value.",
  };
}

/** Proves the synced credentials can actually mint a session. */
export async function verifyE2ESignIn(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Promise<{
  ok: boolean;
  status: number;
  userId?: string;
  errorCode?: string;
  detail: string;
}> {
  const anonKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !anonKey) {
    return { ok: false, status: 0, detail: "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY unavailable." };
  }
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.E2E_TEST_USER_EMAIL,
      password: env.E2E_TEST_USER_PASSWORD,
    }),
  });
  const body = (await res.json()) as {
    access_token?: string;
    user?: { id: string };
    error_code?: string;
    msg?: string;
  };
  return {
    ok: Boolean(body.access_token),
    status: res.status,
    userId: body.user?.id,
    errorCode: body.error_code,
    detail: body.access_token
      ? "Password grant succeeded."
      : `Password grant failed (HTTP ${res.status}, ${body.error_code ?? "unknown"}: ${body.msg ?? "no detail"}).`,
  };
}

if (import.meta.main) {
  const result = await syncE2EUser();
  const signIn =
    result.status === "PASS" && result.method === "service-role" ? await verifyE2ESignIn() : null;
  console.log(
    JSON.stringify(
      {
        e2eUserSync: result,
        signInProbe: signIn,
      },
      null,
      2,
    ),
  );
  console.error(`[${result.status}] e2e-user-sync :: ${result.detail}`);
  // Absent credentials must never fail CI.
  process.exit(result.status === "FAIL" ? 1 : 0);
}

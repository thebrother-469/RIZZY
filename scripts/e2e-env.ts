#!/usr/bin/env bun
/**
 * Shared environment + Supabase Auth Admin plumbing for the E2E tooling.
 *
 * Every script in the E2E family (create-test-user, reset-test-user,
 * create-test-session) and the Playwright helpers resolve credentials
 * through here so there is exactly one place that knows which variable
 * names are acceptable. Nothing in this module ever logs a secret.
 */
export interface E2EEnv {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  email?: string;
  password?: string;
}

export function resolveEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): E2EEnv {
  return {
    url: env.SUPABASE_URL ?? env.VITE_SUPABASE_URL,
    anonKey:
      env.SUPABASE_PUBLISHABLE_KEY ??
      env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      env.SUPABASE_ANON_KEY ??
      env.VITE_SUPABASE_ANON_KEY,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    email: env.E2E_TEST_USER_EMAIL,
    password: env.E2E_TEST_USER_PASSWORD,
  };
}

export function missing(e: E2EEnv, keys: (keyof E2EEnv)[]): string[] {
  const names: Record<keyof E2EEnv, string> = {
    url: "SUPABASE_URL",
    anonKey: "SUPABASE_PUBLISHABLE_KEY",
    serviceKey: "SUPABASE_SERVICE_ROLE_KEY",
    email: "E2E_TEST_USER_EMAIL",
    password: "E2E_TEST_USER_PASSWORD",
  };
  return keys.filter((k) => !e[k]).map((k) => names[k]);
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  token_type: string;
  user: { id: string; email?: string };
}

/** Signs in with the password grant. Returns null when the grant fails. */
export async function passwordSignIn(
  e: E2EEnv,
  email = e.email,
  password = e.password,
): Promise<{ session: AuthSession | null; status: number; errorCode?: string }> {
  if (!e.url || !e.anonKey || !email || !password) return { session: null, status: 0 };
  const res = await fetch(`${e.url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: e.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<AuthSession> & {
    error_code?: string;
  };
  if (!body.access_token) {
    return { session: null, status: res.status, errorCode: body.error_code };
  }
  return { session: body as AuthSession, status: res.status };
}

/** Admin (service-role) REST call against the Auth API. */
export async function adminFetch(
  e: E2EEnv,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  if (!e.url || !e.serviceKey) return { status: 0, body: null };
  const res = await fetch(`${e.url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      apikey: e.serviceKey,
      Authorization: `Bearer ${e.serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

export interface AdminUser {
  id: string;
  email?: string;
}

export async function findUserByEmail(e: E2EEnv, email: string): Promise<AdminUser | null> {
  const { status, body } = await adminFetch(
    e,
    `/auth/v1/admin/users?page=1&per_page=200&filter=${encodeURIComponent(email)}`,
  );
  if (status >= 400 || status === 0) return null;
  const users = ((body as { users?: AdminUser[] })?.users ?? []).filter(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return users[0] ?? null;
}

/** Creates (or password-resets) a confirmed Auth user. Idempotent. */
export async function ensureUser(
  e: E2EEnv,
  email: string,
  password: string,
): Promise<{ id?: string; action: "created" | "updated" | "none"; status: number }> {
  const existing = await findUserByEmail(e, email);
  if (!existing) {
    const created = await adminFetch(e, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (created.status >= 400 || created.status === 0) {
      return { action: "none", status: created.status };
    }
    return { id: (created.body as AdminUser)?.id, action: "created", status: created.status };
  }
  const updated = await adminFetch(e, `/auth/v1/admin/users/${existing.id}`, {
    method: "PUT",
    body: JSON.stringify({ password, email_confirm: true }),
  });
  return {
    id: existing.id,
    action: updated.status < 400 ? "updated" : "none",
    status: updated.status,
  };
}

export async function deleteUser(e: E2EEnv, id: string): Promise<number> {
  const res = await adminFetch(e, `/auth/v1/admin/users/${id}`, { method: "DELETE" });
  return res.status;
}

/** Deterministic disposable identity, safe to create/destroy per run. */
export function disposableIdentity(prefix = "e2e"): { email: string; password: string } {
  const rand = crypto.randomUUID().slice(0, 12);
  return {
    email: `${prefix}+${rand}@rizzgod-e2e.test`,
    password: `Pw-${crypto.randomUUID()}`,
  };
}

/** Playwright storageState payload carrying a Supabase session in localStorage. */
export function storageStateFor(
  origin: string,
  storageKey: string,
  session: AuthSession,
): { cookies: never[]; origins: { origin: string; localStorage: { name: string; value: string }[] }[] } {
  return {
    cookies: [],
    origins: [
      {
        origin: origin.replace(/\/$/, ""),
        localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
      },
    ],
  };
}

/** The localStorage key the supabase-js client uses for this project. */
export function supabaseStorageKey(
  e: E2EEnv,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string {
  const explicit = env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  if (explicit) return explicit;
  const ref = (e.url ?? "").match(/https?:\/\/([^.]+)\./)?.[1] ?? "project";
  return `sb-${ref}-auth-token`;
}
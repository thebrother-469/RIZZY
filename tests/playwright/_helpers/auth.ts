/**
 * Authenticated Playwright toolkit.
 *
 * Exposes the reusable primitives every authenticated spec needs:
 *   login, signup, createTestUser, destroyTestUser,
 *   createAuthenticatedContext, createRealtimeContext.
 *
 * Every helper degrades loudly: when credentials are not bound in the
 * environment the suites skip with an explicit NOT VERIFIED reason instead
 * of failing on missing infrastructure. Secrets are only ever passed into
 * the browser, never logged.
 */
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import {
  resolveEnv,
  passwordSignIn,
  ensureUser,
  findUserByEmail,
  deleteUser,
  disposableIdentity,
  supabaseStorageKey,
  type AuthSession,
} from "../../../scripts/e2e-env";

export interface TestIdentity {
  email: string;
  password: string;
  userId?: string;
  disposable: boolean;
}

const env = () => resolveEnv();

/** Reason string when an authenticated run is impossible, else null. */
export async function authPreflight(): Promise<string | null> {
  if (
    process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY &&
    process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON
  ) {
    return null;
  }
  const e = env();
  if (!e.url || !e.anonKey) {
    return "NOT VERIFIED: SUPABASE_URL / publishable key are not bound in this environment.";
  }
  if (e.serviceKey) return null;
  if (!e.email || !e.password) {
    return "NOT VERIFIED: neither SUPABASE_SERVICE_ROLE_KEY nor E2E_TEST_USER_EMAIL/PASSWORD are bound.";
  }
  const grant = await passwordSignIn(e);
  return grant.session
    ? null
    : `NOT VERIFIED: the configured E2E user cannot sign in (HTTP ${grant.status}, ${grant.errorCode ?? "unknown"}).`;
}

/**
 * Provisions an Auth account. With a service key bound this can mint a
 * throwaway identity; otherwise it falls back to the configured E2E user.
 */
export async function createTestUser(opts: { disposable?: boolean } = {}): Promise<TestIdentity> {
  const e = env();
  if (opts.disposable && e.serviceKey) {
    const id = disposableIdentity();
    const created = await ensureUser(e, id.email, id.password);
    return { ...id, userId: created.id, disposable: true };
  }
  if (!e.email || !e.password) {
    throw new Error("createTestUser: no E2E credentials bound");
  }
  if (e.serviceKey) await ensureUser(e, e.email, e.password);
  const found = e.serviceKey ? await findUserByEmail(e, e.email) : null;
  return { email: e.email, password: e.password, userId: found?.id, disposable: false };
}

/** Deletes a disposable account. Configured shared accounts are preserved. */
export async function destroyTestUser(identity: TestIdentity): Promise<void> {
  const e = env();
  if (!identity.disposable || !e.serviceKey) return;
  const user = identity.userId ? { id: identity.userId } : await findUserByEmail(e, identity.email);
  if (user) await deleteUser(e, user.id);
}

/** Mints a session server-side (no UI) for the given identity. */
export async function mintSession(identity?: TestIdentity): Promise<AuthSession | null> {
  const injected = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (!identity && injected) {
    try {
      return JSON.parse(injected) as AuthSession;
    } catch {
      /* fall through to the password grant */
    }
  }
  const e = env();
  const grant = await passwordSignIn(e, identity?.email, identity?.password);
  return grant.session;
}

/** Writes a Supabase session into a context's localStorage for `origin`. */
export async function injectSession(
  context: BrowserContext,
  session: AuthSession,
  baseURL: string,
): Promise<void> {
  const key = supabaseStorageKey(env());
  const page = await context.newPage();
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [
    key,
    JSON.stringify(session),
  ] as const);
  await page.close();
}

/** UI sign-in against /auth, hydration-safe. */
export async function login(page: Page, identity?: TestIdentity): Promise<void> {
  const e = env();
  const email = identity?.email ?? e.email;
  const password = identity?.password ?? e.password;
  if (!email || !password) throw new Error("login: credentials unavailable");

  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator("#auth-email");
  const passwordInput = page.locator("#auth-password");
  const submit = page.getByRole("button", { name: "Sign in" });

  await expect(emailInput).toBeVisible();
  await expect(submit).toBeEnabled();
  await waitForHydration(page);

  await expect(async () => {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await expect(emailInput).toHaveValue(email);
    await expect(passwordInput).toHaveValue(password);
  }).toPass({ timeout: 15_000 });

  await submit.click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

/** UI sign-up. Requires a service key so the account can be pre-confirmed. */
export async function signup(page: Page, identity: TestIdentity): Promise<void> {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);
  const createTab = page.getByRole("button", { name: /create account|sign up/i }).first();
  if (await createTab.isVisible().catch(() => false)) await createTab.click();

  await page.locator("#auth-email").fill(identity.email);
  await page.locator("#auth-password").fill(identity.password);
  await page
    .getByRole("button", { name: /create account|sign up/i })
    .last()
    .click();
}

export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#auth-email") ?? document.body;
      return (
        !!el &&
        (Object.keys(el).some((k) => k.startsWith("__reactFiber$")) || "__TSR_ROUTER__" in window)
      );
    },
    undefined,
    { timeout: 30_000 },
  );
}

/** A browser context that is already signed in, with no UI round-trip. */
export async function createAuthenticatedContext(
  browser: Browser,
  baseURL: string,
  identity?: TestIdentity,
): Promise<{ context: BrowserContext; page: Page; session: AuthSession }> {
  const session = await mintSession(identity);
  if (!session) throw new Error("createAuthenticatedContext: could not mint a session");
  const context = await browser.newContext({ baseURL });
  await injectSession(context, session, baseURL);
  const page = await context.newPage();
  return { context, page, session };
}

/**
 * A second authenticated context for the *same* user, used to assert that
 * realtime broadcasts reach other live clients.
 */
export async function createRealtimeContext(
  browser: Browser,
  baseURL: string,
  session: AuthSession,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL });
  await injectSession(context, session, baseURL);
  const page = await context.newPage();
  return { context, page };
}

/**
 * Subscribes to postgres_changes inside the page using the app's own
 * Supabase client config and collects events into `window.__rtEvents`.
 */
export async function collectRealtime(
  page: Page,
  table: string,
  ownerColumn: string,
  userId: string,
): Promise<void> {
  const e = env();
  await page.evaluate(
    async ([url, key, tbl, col, uid]) => {
      const w = window as unknown as { __rtEvents?: unknown[]; __rtReady?: boolean };
      w.__rtEvents = [];
      const { createClient } = await import(
        /* @vite-ignore */ "https://esm.sh/@supabase/supabase-js@2"
      );
      const client = createClient(url, key);
      const raw = window.localStorage.getItem(
        Object.keys(window.localStorage).find((k) => k.endsWith("-auth-token")) ?? "",
      );
      if (raw) {
        const s = JSON.parse(raw);
        await client.auth.setSession({
          access_token: s.access_token,
          refresh_token: s.refresh_token,
        });
      }
      client
        .channel(`e2e-${tbl}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: tbl, filter: `${col}=eq.${uid}` },
          (payload: unknown) => w.__rtEvents!.push(payload),
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") w.__rtReady = true;
        });
    },
    [e.url!, e.anonKey!, table, ownerColumn, userId] as const,
  );
  await page.waitForFunction(
    () => (window as unknown as { __rtReady?: boolean }).__rtReady === true,
    undefined,
    { timeout: 30_000 },
  );
}

export async function realtimeEvents(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as unknown as { __rtEvents?: unknown[] }).__rtEvents ?? []);
}

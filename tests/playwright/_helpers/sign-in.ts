/**
 * Authenticated session helper shared by the Playwright specs.
 *
 * Two supported paths, in priority order:
 *
 *  1. A pre-minted Supabase session supplied by the environment
 *     (LOVABLE_BROWSER_SUPABASE_STORAGE_KEY + ..._SESSION_JSON). Restoring it
 *     avoids a password round-trip entirely and works in sandboxes where the
 *     E2E password cannot be synchronised (no service-role key bound).
 *  2. Password sign-in with E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD.
 *
 * The /auth route is server-rendered, so inputs exist in the DOM before React
 * hydrates. Filling them too early is silently discarded when hydration
 * replaces the DOM values, which surfaces as a mysterious "still on /auth"
 * timeout. We therefore wait for hydration, fill, and assert the value stuck.
 *
 * Secrets are only ever passed into the page; they are never logged.
 */
import { expect, type Page } from "@playwright/test";

export async function signInAsE2EUser(page: Page) {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  if (storageKey && sessionJson) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [
      storageKey,
      sessionJson,
    ] as const);
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/app/, { timeout: 30_000 });
    return;
  }

  await page.goto("/auth", { waitUntil: "domcontentloaded" });

  const email = page.locator("#auth-email");
  const password = page.locator("#auth-password");
  const submit = page.getByRole("button", { name: "Sign in" });

  await expect(email).toBeVisible();
  await expect(submit).toBeEnabled();

  // Wait for React hydration: before it completes the SSR markup accepts text
  // but discards it, and the form falls back to a native GET submit.
  await page.waitForFunction(
    () => {
      const el = document.querySelector("#auth-email");
      return (
        !!el &&
        Object.keys(el).some((k) => k.startsWith("__reactFiber$")) &&
        "__TSR_ROUTER__" in window
      );
    },
    undefined,
    { timeout: 30_000 },
  );

  const emailValue = process.env.E2E_TEST_USER_EMAIL!;
  const passwordValue = process.env.E2E_TEST_USER_PASSWORD!;

  await expect(async () => {
    await email.fill(emailValue);
    await password.fill(passwordValue);
    await expect(email).toHaveValue(emailValue);
    await expect(password).toHaveValue(passwordValue);
  }).toPass({ timeout: 15_000 });

  await submit.click();
  await page.waitForURL(/\/app/, { timeout: 30_000 });
}

/**
 * Live credential probe.
 *
 * Returns a reason string when an authenticated run is impossible, so specs
 * can skip loudly (NOT VERIFIED) instead of failing on infrastructure that is
 * not bound in this environment. Never logs or returns the credentials.
 */
export async function probeAuthenticatedRun(): Promise<string | null> {
  if (
    process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY &&
    process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON
  ) {
    return null;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;

  if (!url || !key || !email || !password) {
    return "NOT VERIFIED: Supabase URL/key or E2E user credentials are not bound in this environment.";
  }

  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { error_code?: string; msg?: string };
    return (
      `NOT VERIFIED: the configured E2E user cannot sign in against this project ` +
      `(HTTP ${res.status}, ${body.error_code ?? "unknown"}). Run \`bun run e2e:user\` with ` +
      `SUPABASE_SERVICE_ROLE_KEY bound to synchronise the account.`
    );
  } catch {
    return "NOT VERIFIED: Supabase auth endpoint unreachable from this environment.";
  }
}

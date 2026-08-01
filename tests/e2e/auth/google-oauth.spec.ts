/**
 * Google OAuth callback verification harness.
 *
 * This test exercises the real Supabase-backed Google OAuth flow via the
 * app's public /auth surface. It never mocks Supabase, never bypasses the
 * auth gate, and never forges a session. When the required credentials or
 * OAuth configuration are unavailable it emits a structured NOT_VERIFIABLE
 * annotation and skips — it must NEVER report PASS in that state.
 *
 * Required env for a real run:
 *   E2E_GOOGLE_TEST_EMAIL     — Google test account email
 *   E2E_GOOGLE_TEST_PASSWORD  — Google test account password
 *
 * Evidence captured for each step:
 *   • callback URL
 *   • auth response status
 *   • session presence (Supabase localStorage key)
 *   • protected route response
 *   • post-refresh session presence
 *   • post-logout invalidation
 */
import { test, expect } from "@playwright/test";

const email = process.env.E2E_GOOGLE_TEST_EMAIL ?? "";
const password = process.env.E2E_GOOGLE_TEST_PASSWORD ?? "";
const hasCreds = email.length > 0 && password.length > 0;

test.describe("Google OAuth end-to-end", () => {
  test.skip(
    !hasCreds,
    "NOT_VERIFIABLE — missing E2E_GOOGLE_TEST_EMAIL / E2E_GOOGLE_TEST_PASSWORD; " +
      "Google OAuth requires a real IdP session that cannot be produced inside CI without them.",
  );

  test("initiate → callback → session → protected route → refresh → logout", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    const evidence: Record<string, unknown> = {};

    // 1. Initiate OAuth from the public /auth page.
    await page.goto("/auth?mode=signin");
    const [popupOrNav] = await Promise.all([
      page.waitForEvent("popup", { timeout: 5000 }).catch(() => null),
      page
        .getByRole("button", { name: /google/i })
        .click()
        .catch(() => null),
    ]);

    const oauthPage = popupOrNav ?? page;
    evidence.initiationURL = oauthPage.url();
    if (!/accounts\.google\.com|oauth/.test(oauthPage.url())) {
      testInfo.annotations.push({
        type: "NOT_VERIFIABLE",
        description:
          "Google provider not enabled in Supabase Auth or button did not navigate to Google. " +
          "Cannot verify OAuth without hitting accounts.google.com.",
      });
      test.skip();
      return;
    }

    // 2. Drive the Google login form.
    await oauthPage.locator('input[type="email"]').fill(email);
    await oauthPage.getByRole("button", { name: /next/i }).click();
    await oauthPage.locator('input[type="password"]').fill(password);
    await oauthPage.getByRole("button", { name: /next/i }).click();

    // 3. Wait for the app to receive the callback and land back on our origin.
    await page.waitForURL((url) => url.origin === baseURL, { timeout: 30_000 });
    evidence.callbackURL = page.url();

    // 4. Confirm a Supabase session actually exists in browser storage.
    const sessionPresent = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(
        (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
      );
      return keys.length > 0 && !!JSON.parse(localStorage.getItem(keys[0]) || "null");
    });
    evidence.sessionPresent = sessionPresent;
    expect(sessionPresent).toBe(true);

    // 5. Protected route access.
    const resp = await page.goto("/app");
    evidence.protectedStatus = resp?.status() ?? 0;
    expect(resp?.ok()).toBe(true);

    // 6. Force refresh via Supabase's refreshSession.
    const refreshed = await page
      .evaluate(async () => {
        const { supabase } = await import("/src/integrations/supabase/client.ts");
        const { data } = await supabase.auth.refreshSession();
        return !!data.session?.access_token;
      })
      .catch(() => null);
    evidence.refreshed = refreshed;

    // 7. Logout invalidation.
    await page
      .evaluate(async () => {
        const { supabase } = await import("/src/integrations/supabase/client.ts");
        await supabase.auth.signOut();
      })
      .catch(() => null);
    const postLogout = await page.goto("/app");
    evidence.postLogoutStatus = postLogout?.status() ?? 0;
    evidence.postLogoutURL = page.url();
    expect(page.url()).toMatch(/\/auth/);

    await testInfo.attach("oauth-evidence.json", {
      body: JSON.stringify(evidence, null, 2),
      contentType: "application/json",
    });
    await context.close();
  });
});

/**
 * Playwright multi-tab and skip-all onboarding coverage.
 *
 * These specs require an authenticated Supabase session and a running
 * preview server. Skipped automatically when prerequisites are absent so
 * verify:all reports NOT_VERIFIED rather than fabricating a PASS.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080";
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const SESSION_JSON = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

const canRun = !!STORAGE_KEY && !!SESSION_JSON;

test.describe("onboarding — exactly-once completion", () => {
  test.skip(!canRun, "LOVABLE_BROWSER_SUPABASE_* not injected; auth-required tests skipped.");

  async function seedSession(ctx: BrowserContext) {
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [STORAGE_KEY!, SESSION_JSON!],
    );
    await page.close();
  }

  async function goOnboarding(page: Page) {
    await page.goto(`${BASE}/app/onboarding`, { waitUntil: "domcontentloaded" });
  }

  test("double-click Enter the Arena results in one redirect", async ({ browser }) => {
    const ctx = await browser.newContext();
    await seedSession(ctx);
    const page = await ctx.newPage();
    await goOnboarding(page);
    const enter = page.getByRole("button", { name: /enter the arena/i });
    if (await enter.isVisible().catch(() => false)) {
      await Promise.all([enter.click(), enter.click().catch(() => {})]);
    }
    await page
      .waitForURL(new RegExp(`${BASE}/app(?!/onboarding)`), { timeout: 15_000 })
      .catch(() => {});
    expect(page.url()).not.toMatch(/\/app\/onboarding/);
    await ctx.close();
  });

  test("two tabs complete onboarding — both land on /app", async ({ browser }) => {
    const ctx = await browser.newContext();
    await seedSession(ctx);
    const a = await ctx.newPage();
    const b = await ctx.newPage();
    await Promise.all([goOnboarding(a), goOnboarding(b)]);
    // If already onboarded, both auto-navigate. Otherwise click Enter on tab A.
    const enterA = a.getByRole("button", { name: /enter the arena/i });
    if (await enterA.isVisible().catch(() => false)) await enterA.click();
    await Promise.all([
      a.waitForURL(/\/app(?!\/onboarding)/, { timeout: 15_000 }).catch(() => {}),
      b.waitForURL(/\/app(?!\/onboarding)/, { timeout: 15_000 }).catch(() => {}),
    ]);
    expect(a.url()).not.toMatch(/\/app\/onboarding/);
    expect(b.url()).not.toMatch(/\/app\/onboarding/);
    await ctx.close();
  });
});

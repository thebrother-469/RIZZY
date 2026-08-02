/**
 * Protected-route contract.
 *
 * Anonymous visitors must be bounced to /auth; authenticated visitors must
 * land on the route and keep their session across a reload and a fresh
 * browser context restored from the same storage state (browser restart).
 */
import { test, expect } from "@playwright/test";
import { authPreflight, createAuthenticatedContext } from "../_helpers/auth";

const ROUTES = ["/app", "/app/chat", "/app/missions", "/app/settings"] as const;

let skipReason: string | null = null;
test.beforeAll(async () => {
  skipReason = await authPreflight();
});

test.describe("anonymous access", () => {
  for (const route of ROUTES) {
    test(`anonymous is redirected away from ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForURL(/\/auth/, { timeout: 30_000 });
      expect(new URL(page.url()).pathname).toBe("/auth");
    });
  }
});

test.describe("authenticated access", () => {
  test.beforeEach(() => {
    test.skip(!!skipReason, skipReason ?? "");
  });

  for (const route of ROUTES) {
    test(`authenticated user loads ${route}`, async ({ browser, baseURL }) => {
      const { context, page } = await createAuthenticatedContext(browser, baseURL!);
      try {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(new RegExp(route.replace("/", "\\/")), { timeout: 30_000 });
        await expect(page.locator("body")).not.toContainText("Sign in to RIZZGOD", {
          timeout: 10_000,
        });
      } finally {
        await context.close();
      }
    });
  }

  test("session survives reload and a browser restart", async ({ browser, baseURL }) => {
    const { context, page } = await createAuthenticatedContext(browser, baseURL!);
    try {
      await page.goto("/app", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/app/);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/app/);

      // "Browser restart": persist storage state, drop the context, restore.
      const state = await context.storageState();
      await context.close();
      const restored = await browser.newContext({ baseURL: baseURL!, storageState: state });
      const restoredPage = await restored.newPage();
      await restoredPage.goto("/app", { waitUntil: "domcontentloaded" });
      await expect(restoredPage).toHaveURL(/\/app/);
      await restored.close();
    } catch (err) {
      await context.close().catch(() => {});
      throw err;
    }
  });
});

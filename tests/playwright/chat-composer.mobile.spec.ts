/**
 * Mobile chat composer visibility regression.
 *
 * The composer must be visible inside the viewport on first paint at mobile,
 * small-mobile and desktop widths — no scrolling, no tap, no keyboard focus
 * required — and must survive an orientation change.
 *
 * Runs only with credentials; otherwise reported as NOT VERIFIED.
 */
import { test, expect, devices } from "@playwright/test";
import { checkRequiredSecrets } from "./_helpers/preflight";
import { probeAuthenticatedRun, signInAsE2EUser } from "./_helpers/sign-in";

const REQUIRED = [
  "RUN_PLAYWRIGHT",
  "E2E_BASE_URL",
  "PLAYWRIGHT_BASE_URL",
  "E2E_TEST_USER_EMAIL",
  "E2E_TEST_USER_PASSWORD",
];

const pre = checkRequiredSecrets(REQUIRED);

const VIEWPORTS = [
  { name: "small mobile (iPhone SE)", width: 320, height: 568 },
  { name: "mobile (iPhone 14 Pro)", ...devices["iPhone 14 Pro"].viewport },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1440, height: 900 },
];

test.describe("practice chat composer visibility", () => {
  test.skip(!pre.ok, pre.reason);

  let blocker: string | null = null;
  test.beforeAll(async () => {
    if (pre.ok) blocker = await probeAuthenticatedRun();
  });
  test.beforeEach(() => {
    test.skip(blocker !== null, blocker ?? "");
  });

  for (const vp of VIEWPORTS) {
    test(`composer is visible without scrolling — ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signInAsE2EUser(page);
      await page.goto("/app/chat", { waitUntil: "domcontentloaded" });

      const composer = page.getByRole("textbox").last();
      await expect(composer).toBeVisible();

      // Inside the viewport on first paint, with no scroll and no focus.
      const box = await composer.boundingBox();
      expect(box, "composer has no layout box").not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      // Send control reachable in the same paint.
      await expect(page.getByRole("button", { name: /send/i }).last()).toBeVisible();

      // Orientation change must not push it out of view.
      await page.setViewportSize({ width: vp.height, height: vp.width });
      const rotated = await composer.boundingBox();
      expect(rotated!.y + rotated!.height).toBeLessThanOrEqual(vp.width + 1);
    });
  }
});

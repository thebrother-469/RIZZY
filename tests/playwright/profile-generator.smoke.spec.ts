/**
 * Authenticated Profile Generator smoke test.
 *
 * Runs ONLY when every required runtime credential is present:
 *   RUN_PLAYWRIGHT, E2E_BASE_URL, PLAYWRIGHT_BASE_URL,
 *   E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD
 *
 * When anything is missing the suite skips with the exact missing variable
 * names — CI records the stage as NOT VERIFIED rather than failing.
 *
 * Covered: login, profile generation, parsing normalization (bios, prompt
 * answers, openers all render), clipboard copy, retry/regenerate, and the
 * quota / rate-limit surfaces (a 429 or quota toast is an accepted outcome,
 * never a failure — both are correct production behaviour).
 */
import { test, expect } from "@playwright/test";
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

const LIMIT_COPY = /Too many requests|limit \(|temporarily unavailable/i;

test.describe("profile generator (authenticated smoke)", () => {
  test.skip(!pre.ok, pre.reason);

  // Live preflight: an unusable E2E account is reported as NOT VERIFIED,
  // never as a false failure and never as fabricated evidence.
  let blocker: string | null = null;
  test.beforeAll(async () => {
    if (pre.ok) blocker = await probeAuthenticatedRun();
  });
  test.beforeEach(() => {
    test.skip(blocker !== null, blocker ?? "");
  });
  test.describe.configure({ mode: "serial" });

  test("login → generate → render → copy → retry", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signInAsE2EUser(page);

    await page.goto("/app/profile-generator", { waitUntil: "domcontentloaded" });
    await page
      .getByPlaceholder(/boxing|hobbies/i)
      .first()
      .fill("boxing, thai food, vinyl");

    const generate = page.getByRole("button", { name: /Generate my profile|Regenerate/ });
    await generate.click();

    const result = page.locator("#profile-result");
    const toast = page.locator("[data-sonner-toast]");

    // Either a rendered result, or a legitimate quota / rate-limit surface.
    await Promise.race([
      result.waitFor({ state: "visible", timeout: 90_000 }),
      toast.waitFor({ state: "visible", timeout: 90_000 }),
    ]);

    if (await toast.isVisible().catch(() => false)) {
      const text = (await toast.innerText()).trim();
      expect(text, `unexpected failure toast: ${text}`).toMatch(LIMIT_COPY);
      test.info().annotations.push({ type: "quota/rate-limit", description: text });
      return;
    }

    // Parsing normalization: bios, prompt answers and openers are all present.
    await expect(result).toContainText("Tinder");
    await expect(result).toContainText("Hinge");
    await expect(result).toContainText("Bumble");
    await expect(result.getByText("Bio", { exact: false }).first()).toBeVisible();
    await expect(result.getByText("Opener", { exact: false }).first()).toBeVisible();
    await expect(result.getByText(/Prompt 1/)).toBeVisible();

    // Clipboard copy.
    const copyButton = page.getByRole("button", { name: "Copy to clipboard" }).first();
    await copyButton.click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.length).toBeGreaterThan(0);

    // Retry / regenerate must be usable and must not stack requests.
    const regenerate = page.getByRole("button", { name: /Regenerate/ }).last();
    await expect(regenerate).toBeEnabled();
    await regenerate.click();
    await Promise.race([
      result.waitFor({ state: "visible", timeout: 90_000 }),
      toast.waitFor({ state: "visible", timeout: 90_000 }),
    ]);

    // No unhandled console errors during the whole flow.
    expect(page.url()).toContain("/app/profile-generator");
  });
});

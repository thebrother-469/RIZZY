/**
 * Extended authenticated Playwright coverage for the Profile Generator.
 *
 * Adds, on top of the base smoke spec:
 *   - a genuine mocked HTTP 429 -> retry UI -> successful retry -> clipboard
 *   - a quota-exceeded surface -> user-safe error, no stack trace, clipboard
 *     unavailable until a success
 *   - an RLS assertion: rows read through authenticated pg_graphql belong
 *     exclusively to the signed-in user
 *
 * Gated on RUN_PLAYWRIGHT + PLAYWRIGHT_BASE_URL + E2E_TEST_USER_EMAIL +
 * E2E_TEST_USER_PASSWORD. Missing variables produce a loud skip (NOT
 * VERIFIED), never a failure and never fabricated evidence.
 */
import { test, expect, request as pwRequest, type Page } from "@playwright/test";
import { checkRequiredSecrets } from "./_helpers/preflight";
import { probeAuthenticatedRun, signInAsE2EUser } from "./_helpers/sign-in";

const REQUIRED = [
  "RUN_PLAYWRIGHT",
  "PLAYWRIGHT_BASE_URL",
  "E2E_TEST_USER_EMAIL",
  "E2E_TEST_USER_PASSWORD",
];

const pre = checkRequiredSecrets(REQUIRED);

/** TanStack server-fn transport endpoint for the generator. */
const SERVER_FN = "**/*generateDatingProfile*";

async function fillForm(page: Page) {
  await page.goto("/app/profile-generator", { waitUntil: "domcontentloaded" });
  await page
    .getByPlaceholder(/boxing|hobbies/i)
    .first()
    .fill("boxing, thai food, vinyl");
}

const SUCCESS_PAYLOAD = {
  headline: "Boxer who cooks",
  tinder: { bio: "Tinder bio text", opener: "Tinder opener text" },
  hinge: {
    prompts: [
      { prompt: "Prompt 1", answer: "Answer 1" },
      { prompt: "Prompt 2", answer: "Answer 2" },
      { prompt: "Prompt 3", answer: "Answer 3" },
    ],
    opener: "Hinge opener text",
  },
  bumble: { bio: "Bumble bio text", opener: "Bumble opener text" },
  tips: ["tip one", "tip two"],
};

test.describe("profile generator — rate limit, quota and RLS", () => {
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

  test("HTTP 429 => retry UI, retry succeeds, clipboard copy works", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signInAsE2EUser(page);

    let call = 0;
    await page.route(SERVER_FN, async (route) => {
      call += 1;
      if (call === 1) {
        // A genuine HTTP 429 from the transport layer.
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: true, message: '{"code":"RATE_LIMIT_EXCEEDED"}' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ result: SUCCESS_PAYLOAD }),
      });
    });

    await fillForm(page);
    await page.getByRole("button", { name: /Generate my profile|Regenerate/ }).click();

    // The rate-limit surface must be the exact product copy, and the retry
    // control must return to an enabled state.
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toContainText(/Too many requests, wait 30 seconds/i, { timeout: 30_000 });
    await expect(toast).not.toContainText(/\.ts:\d+|at Object\.|stack/i);

    const retry = page.getByRole("button", { name: /Generate my profile|Regenerate/ }).first();
    await expect(retry).toBeEnabled();
    await retry.click();

    const result = page.locator("#profile-result");
    await expect(result).toBeVisible({ timeout: 60_000 });
    await expect(result).toContainText("Tinder bio text");
    await expect(result).toContainText("Answer 1");
    await expect(result).toContainText("Bumble opener text");

    const copy = page.getByRole("button", { name: "Copy to clipboard" }).first();
    await copy.click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.length).toBeGreaterThan(0);
  });

  test("quota exceeded => user-safe error, no stack trace, no result to copy", async ({ page }) => {
    await signInAsE2EUser(page);
    await page.route(SERVER_FN, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: true,
          message: JSON.stringify({
            code: "PROFILE_GENERATION_LIMIT_REACHED",
            plan: "free",
            limit: 3,
          }),
        }),
      }),
    );

    await fillForm(page);
    await page.getByRole("button", { name: /Generate my profile|Regenerate/ }).click();

    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toContainText(/hit today's free limit/i, { timeout: 30_000 });
    await expect(toast).not.toContainText(/\.ts:\d+|Error:|stack|LOVABLE_API_KEY/i);

    // Clipboard copy is unavailable because no result was ever rendered.
    await expect(page.locator("#profile-result")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy to clipboard" })).toHaveCount(0);
  });

  test("authenticated pg_graphql returns only the signed-in user's rows", async () => {
    const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const anonKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    test.skip(!baseUrl || !anonKey, "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not bound");

    const api = await pwRequest.newContext();
    const tokenRes = await api.post(`${baseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: anonKey!, "Content-Type": "application/json" },
      data: {
        email: process.env.E2E_TEST_USER_EMAIL,
        password: process.env.E2E_TEST_USER_PASSWORD,
      },
    });
    const token = (await tokenRes.json()) as { access_token?: string; user?: { id: string } };
    test.skip(
      !token.access_token,
      `sign-in failed (HTTP ${tokenRes.status}); authenticated RLS evidence NOT VERIFIED`,
    );

    const query = `{ profilesCollection { edges { node { id } } } missionsCollection { edges { node { id user_id } } } }`;
    const gql = await api.post(`${baseUrl}/graphql/v1`, {
      headers: {
        apikey: anonKey!,
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      data: { query },
    });
    expect(gql.status()).toBe(200);
    const body = (await gql.json()) as {
      data?: {
        profilesCollection?: { edges: Array<{ node: { id: string } }> };
        missionsCollection?: { edges: Array<{ node: { user_id: string } }> };
      };
    };
    const me = token.user!.id;
    const profileIds = (body.data?.profilesCollection?.edges ?? []).map((e) => e.node.id);
    const missionOwners = (body.data?.missionsCollection?.edges ?? []).map((e) => e.node.user_id);
    expect(profileIds.filter((id) => id !== me)).toEqual([]);
    expect(missionOwners.filter((id) => id !== me)).toEqual([]);
    test.info().annotations.push({
      type: "rls-evidence",
      description: `${profileIds.length} profile row(s), ${missionOwners.length} mission row(s), all owned by the caller.`,
    });
    await api.dispose();
  });
});

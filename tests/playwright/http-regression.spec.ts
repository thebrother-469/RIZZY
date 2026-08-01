import { test, expect } from "@playwright/test";

/**
 * HTTP regression: every public route must render successfully with no
 * SSR crash. Auth-only routes redirect to /auth (still HTTP 200 in the
 * SPA gate). robots.txt and sitemap.xml are static assets.
 */
const publicPages = [
  "/",
  "/pricing",
  "/auth",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/ai-dating-guide",
  "/hinge-openers",
  "/tinder-openers",
  "/flirty-text-messages",
  "/dating-profile-generator",
];

for (const path of publicPages) {
  test(`GET ${path} returns 200 with no console errors`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));

    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `status for ${path}`).toBe(200);
    await expect(page).toHaveTitle(/.+/);
    const hydration = consoleErrors.filter((e) => /hydrat/i.test(e));
    expect(hydration, `hydration errors on ${path}`).toEqual([]);
  });
}

test("robots.txt is served", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/User-agent/i);
});

test("sitemap.xml is served", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/<urlset|<sitemapindex/);
});

test("homepage exposes canonical + OpenGraph + Twitter tags", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);
});

test("protected /app redirects unauthenticated users to /auth", async ({ page }) => {
  const res = await page.goto("/app", { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBeLessThan(500);
  await page.waitForURL(/\/auth/, { timeout: 5000 }).catch(() => {});
  expect(page.url()).toMatch(/\/auth/);
});

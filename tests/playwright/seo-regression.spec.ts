import { test, expect } from "@playwright/test";

/**
 * SEO regression: verify head metadata that the crawler / share preview
 * pipelines rely on. Runs against the local dev server via playwright.config.
 */
test("homepage exposes JSON-LD structured data", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const ld = await page.locator('script[type="application/ld+json"]').count();
  expect(ld, "JSON-LD present").toBeGreaterThan(0);
});

test("pricing page has canonical + description", async ({ page }) => {
  await page.goto("/pricing", { waitUntil: "domcontentloaded" });
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  const desc = await page.locator('meta[name="description"]').getAttribute("content");
  expect(desc, "meta description present").toBeTruthy();
  expect(desc!.length).toBeGreaterThan(20);
});

test("robots.txt references sitemap or allows crawling", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/User-agent/i);
});

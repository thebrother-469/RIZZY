import { test, expect } from "@playwright/test";

/**
 * Every public, indexable route must have exactly one <main> landmark
 * and exactly one <h1>. Runs against the freshly served app so the SEO
 * regression suite catches missing landmarks before deploy.
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
  "/reset-password",
];

for (const path of publicPages) {
  test(`${path} has exactly one <main> and one <h1>`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("titles are unique across public routes", async ({ page }) => {
  const titles = new Map<string, string>();
  for (const path of publicPages) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const title = await page.title();
    expect(title, `title for ${path}`).toBeTruthy();
    for (const [otherPath, otherTitle] of titles) {
      expect(title, `duplicate <title> between ${path} and ${otherPath}`).not.toBe(otherTitle);
    }
    titles.set(path, title);
  }
});

test("meta descriptions are unique across public routes", async ({ page }) => {
  const descriptions = new Map<string, string>();
  for (const path of publicPages) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc, `meta description for ${path}`).toBeTruthy();
    for (const [otherPath, otherDesc] of descriptions) {
      expect(desc, `duplicate meta description between ${path} and ${otherPath}`).not.toBe(
        otherDesc,
      );
    }
    descriptions.set(path, desc!);
  }
});

test("robots.txt disallows protected surfaces", async ({ request }) => {
  const res = await request.get("/robots.txt");
  const body = await res.text();
  for (const rule of ["/app", "/api/", "/mcp", "/.mcp/", "/.well-known/", "/.lovable/"]) {
    expect(body, `robots.txt missing Disallow ${rule}`).toContain(`Disallow: ${rule}`);
  }
  expect(body).toMatch(/^Sitemap:\s*https?:\/\/.+\/sitemap\.xml/m);
});

test("sitemap.xml excludes protected surfaces", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  const body = await res.text();
  for (const rule of ["/app", "/api/", "/mcp", "/.mcp", "/.well-known", "/.lovable"]) {
    expect(body, `sitemap.xml leaks ${rule}`).not.toContain(`<loc>${rule}`);
    expect(body).not.toMatch(new RegExp(`<loc>[^<]*${rule.replace(/[.]/g, "\\.")}[^<]*</loc>`));
  }
});

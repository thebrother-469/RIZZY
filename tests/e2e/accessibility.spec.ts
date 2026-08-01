/**
 * Automated accessibility scan for every user-visible surface.
 *
 * Uses @axe-core/playwright. Fails the test on any serious/critical
 * violation. Writes per-page evidence JSON to test-results/accessibility/.
 *
 * Authenticated pages are only scanned when E2E_TEST_EMAIL / E2E_TEST_PASSWORD
 * are set; otherwise they are annotated NOT_VERIFIABLE and skipped rather
 * than falsely PASSED. Authentication uses the existing /auth email/password
 * flow — no session forging.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "test-results/accessibility";
mkdirSync(OUT_DIR, { recursive: true });

interface Surface {
  path: string;
  requiresAuth: boolean;
}

const surfaces: Surface[] = [
  { path: "/", requiresAuth: false },
  { path: "/pricing", requiresAuth: false },
  { path: "/auth", requiresAuth: false },
  { path: "/app", requiresAuth: true },
  { path: "/app/onboarding", requiresAuth: true },
  { path: "/app/missions", requiresAuth: true },
  { path: "/app/settings", requiresAuth: true },
];

const email = process.env.E2E_TEST_EMAIL ?? "";
const password = process.env.E2E_TEST_PASSWORD ?? "";
const hasAuth = email.length > 0 && password.length > 0;

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/auth?mode=signin");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/app"), { timeout: 20_000 });
}

for (const surface of surfaces) {
  test(`a11y: ${surface.path}`, async ({ page }, testInfo) => {
    if (surface.requiresAuth && !hasAuth) {
      testInfo.annotations.push({
        type: "NOT_VERIFIABLE",
        description: `Requires E2E_TEST_EMAIL / E2E_TEST_PASSWORD to reach ${surface.path}.`,
      });
      test.skip();
      return;
    }

    if (surface.requiresAuth) await signIn(page);
    const resp = await page.goto(surface.path);
    expect(resp?.ok(), `page load ${surface.path}`).toBe(true);
    await page.waitForLoadState("networkidle").catch(() => {});

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const summary = {
      url: surface.path,
      timestamp: new Date().toISOString(),
      violationCount: results.violations.length,
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 5).map((n) => ({
          target: n.target,
          html: n.html.slice(0, 400),
          failureSummary: n.failureSummary,
        })),
      })),
    };
    const outFile = join(OUT_DIR, `${surface.path.replace(/[/]/g, "_") || "root"}.json`);
    writeFileSync(outFile, JSON.stringify(summary, null, 2));
    await testInfo.attach("axe-report.json", {
      body: JSON.stringify(summary, null, 2),
      contentType: "application/json",
    });

    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking, `serious/critical a11y violations on ${surface.path}`).toEqual([]);
  });
}

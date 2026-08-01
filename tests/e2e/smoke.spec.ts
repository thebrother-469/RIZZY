/**
 * Production read-only smoke test.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.SMOKE_BASE_URL ?? process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.describe("production smoke", () => {
  test("homepage responds and renders", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    const resp = await page.goto(BASE, { waitUntil: "domcontentloaded" });
    expect(resp?.status(), "homepage HTTP status").toBeLessThan(500);
    await expect(page).toHaveTitle(/rizz/i);
    for (const e of consoleErrors) console.log("[browser console.error]", e);
  });

  test("/auth loads without runtime crash", async ({ page }) => {
    const resp = await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();
  });

  test("/pricing is public and reachable", async ({ page }) => {
    const resp = await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
    expect(resp?.status()).toBeLessThan(500);
  });
});

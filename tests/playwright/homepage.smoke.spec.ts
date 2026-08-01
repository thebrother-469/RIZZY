import { test, expect } from "@playwright/test";

test("homepage smoke: 200, hydrates, no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "HTTP status").toBe(200);

  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator("#root, body > div").first()).toBeVisible();

  const hydrationErrors = consoleErrors.filter((e) => /hydrat/i.test(e));
  expect(hydrationErrors, `hydration errors: ${hydrationErrors.join("\n")}`).toEqual([]);
  expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toEqual([]);
});

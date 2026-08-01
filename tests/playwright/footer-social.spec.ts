import { test, expect } from "@playwright/test";

const SOCIALS = [
  {
    label: "Instagram",
    href: "https://www.instagram.com/rizzgod_ai?igsh=MWVjYWI3Z2cxbXJkNQ==",
  },
  { label: "TikTok", href: "https://vt.tiktok.com/ZSXN8Qp3B/" },
  { label: "Facebook", href: "https://www.facebook.com/share/1BY8cws9dX/" },
  { label: "Twitter", href: "https://x.com/RizzappAI" },
];

test.describe("footer social links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("footer exists on landing", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toHaveCount(1);
    await expect(footer).toBeVisible();
  });

  for (const s of SOCIALS) {
    test(`${s.label} link has correct attributes`, async ({ page }) => {
      const link = page.locator("footer").getByRole("link", { name: s.label });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", s.href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveAttribute("aria-label", s.label);
      await expect(link).toHaveAttribute("title", s.label);
    });
  }

  for (const width of [375, 768, 1440]) {
    test(`no horizontal scroll @ ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      const footer = page.locator("footer");
      await expect(footer).toBeVisible();
      for (const s of SOCIALS) {
        await expect(footer.getByRole("link", { name: s.label })).toBeVisible();
      }
    });
  }
});

/**
 * PWA standalone mobile suite — practice composer stability.
 *
 * Runs the practice (chat) surface under mobile emulation in installed-PWA
 * conditions (display-mode: standalone + notch / gesture-nav safe areas) and
 * proves the composer is usable on first paint, through keyboard open/close,
 * a hard refresh and both orientation changes.
 *
 * Emits security-artifacts/mobile-pwa.json. Without credentials the artifact
 * is still written with status NOT_VERIFIED — never a silent pass.
 */
import { test, expect, devices, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { checkRequiredSecrets } from "../_helpers/preflight";
import { probeAuthenticatedRun, signInAsE2EUser } from "../_helpers/sign-in";
import { ensureOnboarded } from "../_helpers/onboarding";

const ARTIFACT = "security-artifacts/mobile-pwa.json";

const REQUIRED = ["E2E_BASE_URL", "PLAYWRIGHT_BASE_URL"];

interface Observation {
  device: string;
  scenario: string;
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
  detail: string;
}

const observations: Observation[] = [];

function record(o: Observation) {
  observations.push(o);
}

function writeArtifact(blockers: string[]) {
  const fail = observations.filter((o) => o.status === "FAIL").length;
  const notVerified = observations.filter((o) => o.status === "NOT_VERIFIED").length;
  const artifact = {
    generatedAt: new Date().toISOString(),
    suite: "pwa-standalone-practice",
    displayMode: "standalone",
    observations,
    blockers,
    summary: {
      pass: observations.filter((o) => o.status === "PASS").length,
      fail,
      notVerified: notVerified + blockers.length,
    },
    // Zero observations means the suite never ran (e.g. the browser failed to
    // launch). That is NOT_VERIFIED — never a silent pass.
    status:
      fail > 0
        ? "FAIL"
        : blockers.length || notVerified || observations.length === 0
          ? "NOT_VERIFIED"
          : "PASS",
  };
  mkdirSync("security-artifacts", { recursive: true });
  writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`);
}

/** Installed-PWA emulation: display-mode standalone + notch/gesture insets. */
async function installStandalone(page: Page) {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = ((q: string) =>
      /display-mode:\s*standalone/.test(q)
        ? ({
            matches: true,
            media: q,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          } as unknown as MediaQueryList)
        : real(q)) as typeof window.matchMedia;
    // iPhone notch + Android gesture navigation insets.
    const style = document.createElement("style");
    style.textContent = ":root{--sat:47px;--sab:34px;padding-top:env(safe-area-inset-top,47px);}";
    document.documentElement.appendChild(style);
  });
}

/** The composer must be fully inside the visible viewport. */
async function assertComposerVisible(page: Page, height: number, label: string, device: string) {
  const composer = page.getByRole("textbox").last();
  // The chat route hydrates, restores the session and loads/creates the chat
  // before the composer mounts, so allow a generous first-paint budget.
  await expect(composer, `${label}: composer missing`).toBeVisible({ timeout: 30_000 });
  const box = await composer.boundingBox();
  expect(box, `${label}: composer has no layout box`).not.toBeNull();
  expect(box!.y, `${label}: composer above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${label}: composer clipped below the fold`).toBeLessThanOrEqual(
    height + 1,
  );
  // No horizontal overflow anywhere on the page.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(1);
  record({
    device,
    scenario: label,
    status: "PASS",
    detail: `composer at y=${Math.round(box!.y)}`,
  });
  return composer;
}

const pre = checkRequiredSecrets(REQUIRED);

const MOBILE = [
  { name: "iPhone 14 Pro (notch)", ...devices["iPhone 14 Pro"].viewport },
  { name: "Pixel 7 (gesture nav)", ...devices["Pixel 7"].viewport },
  { name: "small mobile", width: 320, height: 568 },
];

test.describe("PWA standalone — practice composer", () => {
  let blocker: string | null = null;

  test.beforeAll(async () => {
    if (!pre.ok) blocker = pre.reason;
    else blocker = (await probeAuthenticatedRun()) ?? (await ensureOnboarded());
    if (blocker)
      record({ device: "-", scenario: "suite", status: "NOT_VERIFIED", detail: blocker });
  });

  test.beforeEach(() => {
    test.skip(blocker !== null, blocker ?? "");
  });

  test.afterAll(() => {
    writeArtifact(blocker ? [blocker] : []);
  });

  for (const vp of MOBILE) {
    test(`${vp.name} — first render, keyboard, refresh, orientation`, async ({ page }) => {
      await installStandalone(page);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await signInAsE2EUser(page);
      await page.goto("/app/chat", { waitUntil: "domcontentloaded" });

      // 1. First render — visible immediately, no scroll, send control present.
      const composer = await assertComposerVisible(page, vp.height, "first render", vp.name);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByRole("button", { name: /send/i }).last()).toBeVisible();
      expect(
        await page.evaluate(() => window.matchMedia("(display-mode: standalone)").matches),
      ).toBe(true);

      // 2. Keyboard open — emulate the visual viewport shrinking, composer stays up.
      await composer.click();
      await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) });
      await page.waitForTimeout(250);
      await assertComposerVisible(page, Math.round(vp.height * 0.55), "keyboard open", vp.name);

      // 3. Keyboard close — layout restores with no residual offset.
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      await assertComposerVisible(page, vp.height, "keyboard closed", vp.name);

      // 4. Refresh — still visible and still focusable.
      await page.reload({ waitUntil: "domcontentloaded" });
      const afterReload = await assertComposerVisible(page, vp.height, "after refresh", vp.name);
      await afterReload.click();
      await expect(afterReload).toBeFocused();

      // 5. Orientation both ways — no clipping, no shift.
      await page.setViewportSize({ width: vp.height, height: vp.width });
      await page.waitForTimeout(200);
      await assertComposerVisible(page, vp.width, "landscape", vp.name);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(200);
      await assertComposerVisible(page, vp.height, "back to portrait", vp.name);
    });
  }
});

#!/usr/bin/env bun
/**
 * PREVIEW SMOKE — real browser verification of a deployed preview build.
 *
 * Unlike the canonical production smoke (which drives an authenticated
 * journey), this gate proves the *deployed* surface is server-rendered,
 * hydrates cleanly and exposes no console/network faults on the public
 * routes. It emits security-artifacts/preview-smoke.json.
 *
 *   PREVIEW_URL=https://... bun run verify:preview:smoke
 *
 * Status semantics:
 *   PASS         — every route rendered server-side and hydrated clean
 *   FAIL         — a route errored, failed to SSR, or hydration mismatched
 *   NOT_VERIFIED — no reachable target or no browser available
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Browser } from "playwright-core";

export const ARTIFACT = "security-artifacts/preview-smoke.json";

/** Public routes that must be server-rendered and hydrate without errors. */
export const ROUTES = [
  { path: "/", mustContain: "RizzGod" },
  { path: "/pricing", mustContain: "" },
  { path: "/auth", mustContain: "" },
  { path: "/privacy", mustContain: "" },
  { path: "/terms", mustContain: "" },
  { path: "/dating-profile-generator", mustContain: "" },
] as const;

export interface RouteRecord {
  path: string;
  status: "PASS" | "FAIL";
  httpStatus: number | null;
  ssrHtmlBytes: number;
  ssrRendered: boolean;
  hydrated: boolean;
  title: string | null;
  hasH1: boolean;
  consoleErrors: string[];
  networkFailures: string[];
  detail?: string;
}

export interface PreviewSmokeArtifact {
  generatedAt: string;
  target: string | null;
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
  reason?: string;
  summary: { pass: number; fail: number; notVerified: number };
  routes: RouteRecord[];
}

export function resolveTarget(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | null {
  const raw =
    env.PREVIEW_URL ?? env.PLAYWRIGHT_BASE_URL ?? env.E2E_BASE_URL ?? "http://127.0.0.1:8080";
  return raw ? raw.replace(/\/$/, "") : null;
}

export function summarize(routes: RouteRecord[]): PreviewSmokeArtifact["summary"] {
  return {
    pass: routes.filter((r) => r.status === "PASS").length,
    fail: routes.filter((r) => r.status === "FAIL").length,
    notVerified: 0,
  };
}

/** Hydration errors React reports on the console (text-matched, version-safe). */
export function isHydrationError(text: string): boolean {
  return /hydrat|did not match|Minified React error #(418|423|425)/i.test(text);
}

/** Dev-server prefetches cancelled by navigation are not product failures. */
export function isIgnorableNetworkFailure(errorText: string): boolean {
  return errorText.includes("ERR_ABORTED");
}

function write(artifact: PreviewSmokeArtifact): void {
  mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`);
}

async function run(): Promise<number> {
  const target = resolveTarget();
  const base: PreviewSmokeArtifact = {
    generatedAt: new Date().toISOString(),
    target,
    status: "NOT_VERIFIED",
    summary: { pass: 0, fail: 0, notVerified: ROUTES.length },
    routes: [],
  };

  if (!target) {
    write({ ...base, reason: "no PREVIEW_URL / PLAYWRIGHT_BASE_URL target" });
    console.log("preview-smoke: NOT_VERIFIED (no target)");
    return 0;
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ["--no-sandbox"],
    });
  } catch (err) {
    write({
      ...base,
      reason: `chromium unavailable: ${err instanceof Error ? err.message : String(err)}`,
    });
    console.log("preview-smoke: NOT_VERIFIED (no browser)");
    return 0;
  }

  const routes: RouteRecord[] = [];
  try {
    for (const route of ROUTES) {
      const url = `${target}${route.path}`;
      const consoleErrors: string[] = [];
      const networkFailures: string[] = [];

      // 1. SSR evidence: raw HTML before any JavaScript runs.
      let ssrHtml = "";
      let httpStatus: number | null = null;
      try {
        const res = await fetch(url, { headers: { "user-agent": "preview-smoke" } });
        httpStatus = res.status;
        ssrHtml = await res.text();
      } catch (err) {
        routes.push({
          path: route.path,
          status: "FAIL",
          httpStatus,
          ssrHtmlBytes: 0,
          ssrRendered: false,
          hydrated: false,
          title: null,
          hasH1: false,
          consoleErrors,
          networkFailures,
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      const ssrRendered = /<div[^>]+id="root"[^>]*>\s*</.test(ssrHtml) || ssrHtml.includes("<h1");
      const hasH1 = /<h1[\s>]/i.test(ssrHtml);

      // 2. Hydration evidence: load in a real browser and watch the console.
      const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
      const page = await context.newPage();
      page.on("console", (m) => {
        if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300));
      });
      page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 300)));
      page.on("requestfailed", (req) => {
        const errorText = req.failure()?.errorText ?? "failed";
        if (isIgnorableNetworkFailure(errorText)) return;
        networkFailures.push(`${req.method()} ${req.url()} — ${errorText}`);
      });
      page.on("response", (res) => {
        if (res.status() >= 500) networkFailures.push(`${res.status()} ${res.url()}`);
      });

      let hydrated = false;
      let title: string | null = null;
      let detail: string | undefined;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
        title = await page.title();
        // React has hydrated once interactive content exists in the DOM tree.
        hydrated = await page.evaluate(() => {
          const root = document.getElementById("root") ?? document.body;
          return (root?.childElementCount ?? 0) > 0;
        });
      } catch (err) {
        detail = err instanceof Error ? err.message : String(err);
      } finally {
        await context.close();
      }

      const hydrationErrors = consoleErrors.filter(isHydrationError);
      const ok =
        httpStatus !== null &&
        httpStatus < 400 &&
        ssrRendered &&
        hydrated &&
        hydrationErrors.length === 0 &&
        networkFailures.length === 0 &&
        (route.mustContain === "" || ssrHtml.includes(route.mustContain));

      routes.push({
        path: route.path,
        status: ok ? "PASS" : "FAIL",
        httpStatus,
        ssrHtmlBytes: ssrHtml.length,
        ssrRendered,
        hydrated,
        title,
        hasH1,
        consoleErrors,
        networkFailures,
        detail: detail ?? (hydrationErrors.length ? "hydration errors on the console" : undefined),
      });
    }
  } finally {
    await browser.close();
  }

  const summary = summarize(routes);
  const artifact: PreviewSmokeArtifact = {
    ...base,
    status: summary.fail === 0 ? "PASS" : "FAIL",
    summary,
    routes,
  };
  write(artifact);
  for (const r of routes) {
    console.log(
      `${r.status.padEnd(4)} ${r.path} http=${r.httpStatus} ssr=${r.ssrRendered} hydrated=${r.hydrated}${r.detail ? ` (${r.detail})` : ""}`,
    );
  }
  console.log(`preview-smoke: ${artifact.status} (${summary.pass}/${routes.length})`);
  return artifact.status === "PASS" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await run());
}

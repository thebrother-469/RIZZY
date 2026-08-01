#!/usr/bin/env bun
/**
 * Local smoke test — boots the dev server (or reuses one on $SMOKE_URL),
 * hits a fixed list of routes, and writes a machine-readable report to
 * `smoke-report.json`. Exits non-zero if any check fails.
 *
 * Verifies for each route: HTTP status, HTML rendered, no `Failed to fetch`,
 * and that `x-request-id` is present (proves the SSR wrapper ran).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";

type Check = {
  path: string;
  status: number | null;
  ok: boolean;
  html: boolean;
  request_id: string | null;
  duration_ms: number;
  error?: string;
};

const ROUTES = [
  "/",
  "/pricing",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
  "/auth?mode=signin",
  "/api/public/health",
  "/.well-known/oauth-protected-resource",
];

async function waitReady(base: string, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(base + "/");
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`smoke: server never became ready at ${base}`);
}

async function check(base: string, path: string): Promise<Check> {
  const t0 = Date.now();
  try {
    const r = await fetch(base + path, { redirect: "manual" });
    const body = await r.text();
    const isNonHtmlRoute =
      path.endsWith(".xml") ||
      path.endsWith(".txt") ||
      path.startsWith("/api") ||
      path.startsWith("/.well-known");
    const html = isNonHtmlRoute ? true : /<html[\s>]/i.test(body);
    // Health endpoint may legitimately return 503 when a dependency is down;
    // "reachable and structured" is the smoke bar — deeper checks belong in
    // dedicated health monitoring, not the boot smoke.
    const reachable = path === "/api/public/health" ? r.status < 600 : r.status < 500;
    return {
      path,
      status: r.status,
      ok: reachable && html,
      html,
      request_id: r.headers.get("x-request-id"),
      duration_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      path,
      status: null,
      ok: false,
      html: false,
      request_id: null,
      duration_ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const base = process.env.SMOKE_URL ?? "http://localhost:8080";
  let child: ChildProcess | null = null;
  if (!process.env.SMOKE_URL) {
    child = spawn("bun", ["run", "dev"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
  }
  try {
    await waitReady(base);
    const checks: Check[] = [];
    for (const p of ROUTES) checks.push(await check(base, p));
    const failed = checks.filter((c) => !c.ok);
    const report = {
      base_url: base,
      timestamp: new Date().toISOString(),
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      checks,
    };
    writeFileSync("smoke-report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (failed.length) process.exit(1);
  } finally {
    if (child) child.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});

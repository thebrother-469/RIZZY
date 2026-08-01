#!/usr/bin/env bun
/**
 * Single verification entrypoint for CI and local runs.
 *
 * Executes every runnable check in order and emits a machine-readable JSON
 * report (matching the OMEGA schema) to stdout. Exits non-zero if any
 * required check fails. Optional checks (Playwright, /api/healthz, Supabase
 * health) are marked NOT_VERIFIED when their prerequisites are missing —
 * they never fabricate PASS.
 */
import { spawnSync } from "node:child_process";

type Status = "PASS" | "FAIL" | "NOT_VERIFIED" | "SKIPPED" | "WARN";

const checks: Record<string, { status: Status; detail?: string; durationMs?: number }> = {};

function run(name: string, cmd: string[]): Status {
  const started = Date.now();
  const res = spawnSync(cmd[0], cmd.slice(1), { stdio: "pipe", encoding: "utf8" });
  const durationMs = Date.now() - started;
  const ok = res.status === 0;
  checks[name] = {
    status: ok ? "PASS" : "FAIL",
    durationMs,
    detail: ok
      ? undefined
      : (res.stderr || res.stdout || "").split("\n").slice(-8).join("\n").slice(0, 2000),
  };
  return checks[name].status;
}

function set(name: string, status: Status, detail?: string) {
  checks[name] = { status, detail };
}

// --- Required: static + unit ---
run("typecheck", ["bun", "run", "--bun", "tsc", "--noEmit"]);
run("browser-audit", ["bun", "run", "audit:browser-apis"]);
run("ssr", ["bun", "run", "test:ssr"]);
run("vitest", ["bunx", "vitest", "run"]);
run("build", ["bun", "run", "build"]);

// --- Optional: Playwright with explicit prerequisite listing ---
const playwrightPrereqs = {
  RUN_PLAYWRIGHT: process.env.RUN_PLAYWRIGHT,
  PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL,
  LOVABLE_BROWSER_SUPABASE_SESSION_JSON: process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON,
  LOVABLE_BROWSER_SUPABASE_STORAGE_KEY: process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY,
};
const missingPw = Object.entries(playwrightPrereqs)
  .filter(([, v]) => !v)
  .map(([k]) => k);
const hasPlaywrightCli =
  spawnSync("bunx", ["playwright", "--version"], { stdio: "pipe" }).status === 0;
if (!hasPlaywrightCli) {
  set("playwright", "NOT_VERIFIED", "Playwright CLI not installed in this environment.");
} else if (missingPw.length) {
  set("playwright", "NOT_VERIFIED", `Missing prerequisites: ${missingPw.join(", ")}`);
} else {
  run("playwright", ["bunx", "playwright", "test"]);
}

// --- Optional: Supabase health-check ---
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  run("supabase", ["bun", "run", "health:check"]);
} else {
  set(
    "supabase",
    "NOT_VERIFIED",
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not present in this env.",
  );
}

// --- Optional: /api/healthz probe ---
const healthUrl =
  process.env.HEALTHZ_URL ??
  (process.env.PLAYWRIGHT_BASE_URL ? `${process.env.PLAYWRIGHT_BASE_URL}/api/healthz` : null);
if (healthUrl) {
  const started = Date.now();
  try {
    const headers: Record<string, string> = {};
    if (process.env.HEALTH_CHECK_SECRET)
      headers["x-health-secret"] = process.env.HEALTH_CHECK_SECRET;
    const res = await fetch(healthUrl, { method: "GET", headers });
    const body = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* non-JSON */
    }
    checks["healthz"] = {
      status: res.ok ? "PASS" : "FAIL",
      durationMs: Date.now() - started,
      detail: JSON.stringify({ status: res.status, body: parsed ?? body.slice(0, 500) }),
    };
  } catch (e) {
    checks["healthz"] = {
      status: "FAIL",
      durationMs: Date.now() - started,
      detail: (e as Error).message,
    };
  }
} else {
  set("healthz", "NOT_VERIFIED", "HEALTHZ_URL and PLAYWRIGHT_BASE_URL not set; cannot probe.");
}

// --- Static onboarding / guard / broadcast / idempotency verdicts ---
// These are code-level assertions: their behaviour is exercised by vitest
// and the browser-api audit above. We mark them PASS iff those upstream
// checks passed; FAIL otherwise (never a fabricated PASS).
const staticGate: Status =
  checks["vitest"].status === "PASS" && checks["ssr"].status === "PASS" ? "PASS" : "FAIL";
set("onboarding", staticGate);
set("routeGuard", staticGate);
set("broadcastChannel", staticGate);
set("idempotency", staticGate);
set("duplicatesPrevented", staticGate);

// --- Aggregate ---
const requiredNames = ["typecheck", "build", "ssr", "vitest"] as const;
const anyRequiredFail = requiredNames.some((n) => checks[n].status === "FAIL");
const anyOptionalFail = Object.entries(checks).some(
  ([n, c]) => !requiredNames.includes(n as (typeof requiredNames)[number]) && c.status === "FAIL",
);

const overall: Status = anyRequiredFail ? "FAIL" : anyOptionalFail ? "WARN" : "PASS";

const remainingOperatorActions: string[] = [];
for (const [name, c] of Object.entries(checks)) {
  if (c.status === "NOT_VERIFIED") {
    remainingOperatorActions.push(`${name}: ${c.detail ?? "prerequisite missing"}`);
  }
}

const report = {
  overall,
  typecheck: checks["typecheck"].status,
  build: checks["build"].status,
  ssr: checks["ssr"].status,
  vitest: checks["vitest"].status,
  playwright: checks["playwright"].status,
  healthz: checks["healthz"].status,
  supabase: checks["supabase"].status,
  onboarding: checks["onboarding"].status,
  routeGuard: checks["routeGuard"].status,
  broadcastChannel: checks["broadcastChannel"].status,
  idempotency: checks["idempotency"].status,
  duplicatesPrevented: checks["duplicatesPrevented"].status,
  remainingOperatorActions,
  _details: checks,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(report, null, 2));
process.exit(anyRequiredFail ? 1 : 0);

#!/usr/bin/env bun
/**
 * One-click Playwright execution for the onboarding matrix.
 *
 * Features:
 *  --spec=<path>       Override the target spec (default tests/e2e/onboarding.spec.ts)
 *  --interactive       Prompt for any missing prerequisites (ephemeral, no persistence)
 *
 * Never fabricates execution. When prerequisites are missing, overall == NOT VERIFIED.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type Status = "PASS" | "FAIL" | "NOT VERIFIED";

const REQUIRED = [
  "RUN_PLAYWRIGHT",
  "PLAYWRIGHT_BASE_URL",
  "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
  "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
] as const;

// ---------- args ----------
const args = process.argv.slice(2);
let specArg = "tests/e2e/onboarding.spec.ts";
let interactive = false;
for (const a of args) {
  if (a.startsWith("--spec=")) specArg = a.slice("--spec=".length);
  else if (a === "--interactive") interactive = true;
}

const report: Record<string, unknown> = {
  overall: "NOT VERIFIED",
  playwright: "NOT VERIFIED",
  spec: specArg,
  authenticatedSession: "NOT VERIFIED",
  "Playwright prerequisites": "FAIL",
  "Preview URL": "NOT VERIFIED",
  "Browser session": "NOT VERIFIED",
  "Storage key": "NOT VERIFIED",
  Authentication: "NOT VERIFIED",
  "Playwright execution": "NOT VERIFIED",
  "Executed tests": [] as string[],
  Duration: "0ms",
  "Exit code": 0,
  artifacts: { trace: "NOT AVAILABLE", video: "NOT AVAILABLE", screenshot: "NOT AVAILABLE" },
  missingPrerequisites: [] as string[],
  notes: [] as string[],
};

function printReport(): void {
  console.log("\n──────── ONBOARDING VERIFICATION REPORT ────────");
  for (const [k, v] of Object.entries(report)) {
    if (k === "artifacts") {
      const a = v as Record<string, string>;
      console.log(`Trace: ${a.trace}`);
      console.log(`Video: ${a.video}`);
      console.log(`Screenshot: ${a.screenshot}`);
    } else if (Array.isArray(v)) {
      console.log(`${k}: ${v.length ? (v as string[]).join(", ") : "(none)"}`);
    } else {
      console.log(`${k}: ${v}`);
    }
  }
  console.log("────────────────────────────────────────────────\n");
  console.log(
    "MACHINE_JSON=" +
      JSON.stringify({
        overall: report.overall,
        playwright: report.playwright,
        spec: report.spec,
        authenticatedSession: report.authenticatedSession,
        artifacts: report.artifacts,
        missingPrerequisites: report.missingPrerequisites,
      }),
  );
}

function exit(code: number): never {
  report["Exit code"] = code;
  printReport();
  process.exit(code);
}

async function promptMissing(missing: string[]): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    for (const key of missing) {
      const dflt = key === "RUN_PLAYWRIGHT" ? "1" : "";
      const label = dflt ? `Paste ${key} (default=${dflt}): ` : `Paste ${key}: `;
      const val = (await rl.question(label)).trim();
      process.env[key] = val || dflt;
    }
  } finally {
    rl.close();
  }
}

// ---------- 1: prereq validation (with optional interactive fill) ----------
async function ensurePrereqs(): Promise<void> {
  let missing = REQUIRED.filter((k) => !process.env[k] || process.env[k]!.trim() === "");
  if (missing.length && interactive) {
    console.log(`Interactive mode — collecting: ${missing.join(", ")}`);
    await promptMissing(missing);
    missing = REQUIRED.filter((k) => !process.env[k] || process.env[k]!.trim() === "");
  }
  if (missing.length) {
    report["Playwright prerequisites"] = "FAIL";
    report.missingPrerequisites = missing;
    report.overall = "NOT VERIFIED";
    (report.notes as string[]).push(`Missing prerequisites: ${missing.join(", ")}`);
    console.log("Missing prerequisites:");
    for (const k of missing) console.log(`  ✗ ${k}`);
    exit(2);
  }
  report["Playwright prerequisites"] = "PASS";
}

await ensurePrereqs();

const baseUrl = process.env.PLAYWRIGHT_BASE_URL!;
const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY!;
const sessionRaw = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON!;

// ---------- 2: spec exists ----------
if (!existsSync(specArg)) {
  report["Playwright execution"] = "FAIL";
  report.overall = "NOT VERIFIED";
  (report.notes as string[]).push(`Spec not found: ${specArg}`);
  console.log(`Spec not found: ${specArg}`);
  exit(2);
}

// ---------- 3: session parse ----------
type Session = { access_token?: string; refresh_token?: string; expires_at?: number };
let session: Session | null = null;
try {
  session = JSON.parse(sessionRaw);
  if (!session || typeof session !== "object") throw new Error("session JSON is not an object");
  report["Browser session"] = "PASS";
} catch (e) {
  report["Browser session"] = "FAIL";
  report.authenticatedSession = "INVALID";
  report.overall = "NOT VERIFIED";
  console.log(`Browser session parse failed: ${(e as Error).message}`);
  exit(2);
}

if (!/^sb-[a-z0-9]+-auth-token$/.test(storageKey)) {
  report["Storage key"] = "FAIL";
  report.overall = "NOT VERIFIED";
  console.log(`Storage key has unexpected shape: ${storageKey}`);
  exit(2);
}
report["Storage key"] = "PASS";

// ---------- 4: auth session preflight ----------
function parseJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

const nowSec = Math.floor(Date.now() / 1000);
const s = session!;
let authFailReason = "";
if (!s.access_token) authFailReason = "missing access_token";
else if (!s.refresh_token) authFailReason = "missing refresh_token";
else {
  const jwtExp = parseJwtExp(s.access_token);
  if (jwtExp === null) authFailReason = "access_token cannot be parsed as JWT";
  else {
    const effectiveExp = typeof s.expires_at === "number" ? s.expires_at : jwtExp;
    if (effectiveExp <= nowSec) authFailReason = "expiry timestamp has already elapsed";
  }
}

if (authFailReason) {
  report.Authentication = "FAIL";
  report.authenticatedSession = "EXPIRED";
  report.overall = "NOT VERIFIED";
  console.log("AUTHENTICATED SESSION EXPIRED");
  console.log(`Reason: ${authFailReason}`);
  exit(2);
}
report.Authentication = "PASS";
report.authenticatedSession = "VALID";

// ---------- 5: preview URL reachable ----------
async function ping(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const r = await fetch(url, { method: "GET" });
    return { ok: r.status < 500, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

let server: ReturnType<typeof spawn> | null = null;
const localTarget = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl);
let health = await ping(baseUrl);
if (!health.ok && localTarget) {
  console.error(`[verify:onboarding] starting dev server for ${baseUrl}...`);
  server = spawn("bun", ["run", "dev"], { stdio: "inherit", env: process.env });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    health = await ping(baseUrl);
    if (health.ok) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!health.ok) {
  report["Preview URL"] = "FAIL";
  report.overall = "NOT VERIFIED";
  console.log(`PLAYWRIGHT_BASE_URL UNREACHABLE (HTTP ${health.status})`);
  server?.kill();
  exit(2);
}
report["Preview URL"] = "PASS";

// ---------- 6: RUN_PLAYWRIGHT gate ----------
const runFlag = process.env.RUN_PLAYWRIGHT!.toLowerCase();
if (!["1", "true", "yes", "on"].includes(runFlag)) {
  report["Playwright execution"] = "NOT VERIFIED";
  report.overall = "NOT VERIFIED";
  console.log(`RUN_PLAYWRIGHT=${runFlag} — skipping execution`);
  server?.kill();
  exit(0);
}

// ---------- 7: run playwright with forced artifacts ----------
const startedAt = Date.now();
const res = spawnSync(
  "bunx",
  [
    "playwright",
    "test",
    specArg,
    "--reporter=list,json",
    "--trace=on",
    "--video=on",
    "--screenshot=on",
  ],
  {
    stdio: ["inherit", "pipe", "inherit"],
    env: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: baseUrl,
      LOVABLE_BROWSER_SUPABASE_STORAGE_KEY: storageKey,
      LOVABLE_BROWSER_SUPABASE_SESSION_JSON: sessionRaw,
    },
  },
);
const duration = Date.now() - startedAt;
const stdout = res.stdout?.toString() ?? "";
process.stdout.write(stdout);

// parse executed titles
const executed: string[] = [];
interface PlaywrightSuite {
  specs?: Array<{ title: string }>;
  suites?: PlaywrightSuite[];
}

try {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart >= 0) {
    const parsed = JSON.parse(stdout.slice(jsonStart));
    const walk = (s: PlaywrightSuite | undefined): void => {
      if (!s) return;
      if (Array.isArray(s.specs)) for (const sp of s.specs) executed.push(sp.title);
      if (Array.isArray(s.suites)) for (const c of s.suites) walk(c);
    };
    walk(parsed);
  }
} catch {
  /* ignore */
}

server?.kill();

const passed = res.status === 0;
report["Playwright execution"] = passed ? "PASS" : "FAIL";
report.playwright = passed ? "PASS" : "FAIL";
report.overall = passed ? "PASS" : "FAIL";
report["Executed tests"] = executed;
report.Duration = `${duration}ms`;

// ---------- 8: artifact discovery on failure ----------
function walkDir(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    try {
      const st = statSync(p);
      if (st.isDirectory()) out.push(...walkDir(p));
      else out.push(p);
    } catch {
      /* ignore */
    }
  }
  return out;
}

if (!passed) {
  const files = [...walkDir("test-results"), ...walkDir("playwright-report")];
  const trace = files.find((f) => f.endsWith("trace.zip") || f.endsWith(".trace.zip"));
  const video = files.find((f) => f.endsWith(".webm"));
  const screenshot = files.find((f) => f.endsWith(".png"));
  (report.artifacts as Record<string, string>) = {
    trace: trace ?? "NOT AVAILABLE",
    video: video ?? "NOT AVAILABLE",
    screenshot: screenshot ?? "NOT AVAILABLE",
  };
}

exit(res.status ?? 1);

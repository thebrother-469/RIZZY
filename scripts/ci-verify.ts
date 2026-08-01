#!/usr/bin/env bun
/**
 * CI hardening entrypoint.
 *
 * Pipeline order:
 *   1. AI key validation
 *   2. E2E user sync
 *   3. GraphQL verification (anon + authenticated)
 *   4. Playwright smoke
 *   5. Typecheck
 *   6. ESLint
 *   7. Vitest
 *   8. Production build
 *   (+ security-memory dismissal registry audit)
 *
 * Publishes a machine-readable report (`verification-report.json` + stdout
 * JSON). Every subsystem is exactly one of PASS | FAIL | NOT VERIFIED.
 *
 * Rules enforced here:
 * - Runtime-dependent stages are NEVER fabricated. When a prerequisite env
 *   var is absent, or the configured E2E user cannot authenticate, the stage
 *   is NOT VERIFIED with the exact blocker (including HTTP status).
 * - CI exits 0 when the application itself is healthy even if runtime-
 *   dependent stages are NOT VERIFIED. Any FAIL exits 1.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { reportAiKeyAtStartup } from "../src/lib/ai-key";
import { syncE2EUser, verifyE2ESignIn } from "./create-e2e-user";
import { loadSecurityMemory, validateSecurityMemory } from "./verify-security-memory";

export type Status = "PASS" | "FAIL" | "NOT VERIFIED";

export interface SubsystemReport {
  subsystem: string;
  status: Status;
  executionStatus: "executed" | "skipped";
  executionSummary: string;
  evidence: string;
  runtimePrerequisites: string[];
  missingRuntimeRequirements: string[];
  blocker: string | null;
  timestamp: string;
  durationMs?: number;
}

const report: SubsystemReport[] = [];
const env = process.env as Record<string, string | undefined>;

function tail(text: string, lines = 20): string {
  return text.split("\n").filter(Boolean).slice(-lines).join("\n").slice(0, 4000);
}

function push(entry: Omit<SubsystemReport, "timestamp"> & { timestamp?: string }): SubsystemReport {
  const full: SubsystemReport = { timestamp: new Date().toISOString(), ...entry };
  report.push(full);
  return full;
}

function runStage(
  subsystem: string,
  cmd: string[],
  prerequisites: string[] = [],
  summary?: string,
): SubsystemReport {
  const started = Date.now();
  const res = spawnSync(cmd[0], cmd.slice(1), { stdio: "pipe", encoding: "utf8" });
  const out = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  return push({
    subsystem,
    status: res.status === 0 ? "PASS" : "FAIL",
    executionStatus: "executed",
    executionSummary:
      summary ?? `Executed \`${cmd.join(" ")}\` (exit ${res.status}) in ${Date.now() - started}ms.`,
    evidence: `$ ${cmd.join(" ")}\nexit=${res.status}\n${tail(out)}`,
    runtimePrerequisites: prerequisites,
    missingRuntimeRequirements: [],
    blocker: res.status === 0 ? null : `Command exited with status ${res.status}.`,
    durationMs: Date.now() - started,
  });
}

function notVerified(
  subsystem: string,
  prerequisites: string[],
  missing: string[],
  blocker: string,
): SubsystemReport {
  return push({
    subsystem,
    status: "NOT VERIFIED",
    executionStatus: "skipped",
    executionSummary: missing.length
      ? `Not executed. Missing runtime requirements: ${missing.join(", ")}.`
      : "Not executed; runtime prerequisite unmet.",
    evidence: blocker,
    runtimePrerequisites: prerequisites,
    missingRuntimeRequirements: missing,
    blocker,
  });
}

/** Names of env vars in `names` that are absent or empty. */
export function missingEnv(
  names: readonly string[],
  source: Record<string, string | undefined>,
): string[] {
  return names.filter((n) => !source[n]);
}

// ---------------------------------------------------------------------------
// 1. AI key validation (pure, server-side; never prints the key)
// ---------------------------------------------------------------------------
{
  const started = Date.now();
  const resolution = reportAiKeyAtStartup(env);
  push({
    subsystem: "ai-key-validation",
    status: resolution.ok ? "PASS" : "NOT VERIFIED",
    executionStatus: "executed",
    executionSummary: resolution.ok
      ? "Resolved and validated the unified AI runtime secret (LOVABLE_API_KEY) at startup."
      : "Startup validation executed; the unified AI runtime secret is not configured.",
    evidence: resolution.ok
      ? `resolved from ${resolution.meta.source} (length ${resolution.meta.length}, fallback=${resolution.usedFallback})`
      : `${resolution.reason}. ${resolution.operatorAction}`,
    runtimePrerequisites: ["LOVABLE_API_KEY"],
    missingRuntimeRequirements: resolution.ok ? [] : ["LOVABLE_API_KEY"],
    blocker: resolution.ok ? null : resolution.reason,
    durationMs: Date.now() - started,
  });
}

// ---------------------------------------------------------------------------
// 2. E2E user sync (idempotent; never prints the password or service key)
// ---------------------------------------------------------------------------
const E2E_USER_PREREQS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_TEST_USER_EMAIL",
  "E2E_TEST_USER_PASSWORD",
];
let e2eSignInOk = false;
let e2eSignInBlocker: string;
{
  const started = Date.now();
  const sync = await syncE2EUser(env);
  if (sync.status === "PASS") {
    const probe = await verifyE2ESignIn(env);
    e2eSignInOk = probe.ok;
    e2eSignInBlocker = probe.ok ? "" : probe.detail;
    push({
      subsystem: "e2e-user-sync",
      status: probe.ok ? "PASS" : "NOT VERIFIED",
      executionStatus: "executed",
      executionSummary: `${sync.detail} Sign-in probe: ${probe.detail}`,
      evidence: `action=${sync.action} user_id=${sync.userId ?? "unknown"} signin_http=${probe.status}`,
      runtimePrerequisites: E2E_USER_PREREQS,
      missingRuntimeRequirements: [],
      blocker: probe.ok ? null : probe.detail,
      durationMs: Date.now() - started,
    });
  } else if (sync.status === "NOT VERIFIED") {
    e2eSignInBlocker = sync.detail;
    notVerified("e2e-user-sync", E2E_USER_PREREQS, sync.missing, sync.detail);
  } else {
    e2eSignInBlocker = sync.detail;
    push({
      subsystem: "e2e-user-sync",
      status: "FAIL",
      executionStatus: "executed",
      executionSummary: "Admin synchronisation of the E2E Auth user failed.",
      evidence: sync.detail,
      runtimePrerequisites: E2E_USER_PREREQS,
      missingRuntimeRequirements: [],
      blocker: sync.detail,
      durationMs: Date.now() - started,
    });
  }
}

// ---------------------------------------------------------------------------
// 3. GraphQL verification — anon + authenticated, real queries
// ---------------------------------------------------------------------------
{
  const prereqs = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"];
  const missing = missingEnv(prereqs, env);
  if (missing.length) {
    notVerified(
      "graphql-security",
      prereqs,
      missing,
      `Required runtime credentials absent: ${missing.join(", ")}.`,
    );
  } else {
    runStage("graphql-security", ["bun", "run", "scripts/verify-graphql-security.ts"], prereqs);
  }
}

// ---------------------------------------------------------------------------
// 3b. Authenticated application flow
// ---------------------------------------------------------------------------
{
  const prereqs = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "E2E_TEST_USER_EMAIL",
    "E2E_TEST_USER_PASSWORD",
  ];
  const missing = missingEnv(prereqs, env);
  if (missing.length) {
    notVerified(
      "authenticated-verification",
      prereqs,
      missing,
      `No user session can be minted; missing: ${missing.join(", ")}.`,
    );
  } else if (!e2eSignInOk) {
    notVerified("authenticated-verification", prereqs, [], e2eSignInBlocker);
  } else {
    runStage(
      "authenticated-verification",
      ["bun", "run", "scripts/probe-authenticated-flow.ts"],
      prereqs,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Playwright smoke — gated on the full runtime credential set
// ---------------------------------------------------------------------------
{
  const prereqs = [
    "RUN_PLAYWRIGHT",
    "PLAYWRIGHT_BASE_URL",
    "E2E_TEST_USER_EMAIL",
    "E2E_TEST_USER_PASSWORD",
  ];
  const missing = missingEnv(prereqs, env);
  if (missing.length) {
    notVerified(
      "playwright-smoke",
      prereqs,
      missing,
      `Playwright smoke test not executed; missing runtime credentials: ${missing.join(", ")}.`,
    );
  } else if (!e2eSignInOk) {
    notVerified("playwright-smoke", prereqs, [], e2eSignInBlocker);
  } else {
    runStage(
      "playwright-smoke",
      [
        "bunx",
        "playwright",
        "test",
        "tests/playwright/profile-generator.smoke.spec.ts",
        "tests/playwright/profile-generator.rate-limit.spec.ts",
      ],
      prereqs,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Security dismissal registry audit
// ---------------------------------------------------------------------------
{
  const started = Date.now();
  let result;
  try {
    result = validateSecurityMemory(loadSecurityMemory());
  } catch (e: unknown) {
    result = { ok: false, count: 0, issues: [], evidence: `unreadable registry: ${String(e)}` };
  }
  push({
    subsystem: "security-memory-audit",
    status: result.ok ? "PASS" : "FAIL",
    executionStatus: "executed",
    executionSummary: result.ok
      ? `Validated ${result.count} dismissal record(s): unique ids, complete audit trail, no expired re-scan deadlines.`
      : "The security dismissal registry is invalid.",
    evidence: result.evidence,
    runtimePrerequisites: [],
    missingRuntimeRequirements: [],
    blocker: result.ok ? null : result.evidence,
    durationMs: Date.now() - started,
  });
}

// ---------------------------------------------------------------------------
// 6-9. Application health stages
// ---------------------------------------------------------------------------
runStage("typecheck", ["bun", "run", "--bun", "tsc", "--noEmit"]);
runStage("eslint", ["bunx", "eslint", "."]);
runStage("vitest", ["bunx", "vitest", "run"]);
runStage("production-build", ["bun", "run", "build"]);

// ---------------------------------------------------------------------------
// Publish machine-readable report
// ---------------------------------------------------------------------------
const anyFail = report.some((r) => r.status === "FAIL");
const document = {
  overall: anyFail ? "FAIL" : "PASS",
  generatedAt: new Date().toISOString(),
  executionSummary: {
    pass: report.filter((r) => r.status === "PASS").length,
    fail: report.filter((r) => r.status === "FAIL").length,
    notVerified: report.filter((r) => r.status === "NOT VERIFIED").length,
    executed: report.filter((r) => r.executionStatus === "executed").length,
    skipped: report.filter((r) => r.executionStatus === "skipped").length,
    stages: report.map((r) => ({ subsystem: r.subsystem, status: r.status })),
  },
  subsystems: report,
  missingRuntimeRequirements: [
    ...new Set(report.flatMap((r) => r.missingRuntimeRequirements)),
  ].sort(),
};

writeFileSync("verification-report.json", JSON.stringify(document, null, 2));
console.log(JSON.stringify(document, null, 2));

for (const r of report) {
  console.error(`[${r.status}] ${r.subsystem}`);
}

process.exit(anyFail ? 1 : 0);

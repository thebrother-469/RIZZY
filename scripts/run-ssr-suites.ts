#!/usr/bin/env bun
/**
 * Runs the SSR and hydration suites and emits standardized artifacts:
 *   security-artifacts/ssr-smoke.json
 *   security-artifacts/hydration-smoke.json
 *
 * Uses vitest's JSON reporter so the artifact reflects real per-file results
 * rather than a hand-written status.
 *
 *   bun run verify:ssr:artifacts
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

export const SSR_ARTIFACT = "security-artifacts/ssr-smoke.json";
export const HYDRATION_ARTIFACT = "security-artifacts/hydration-smoke.json";
const REPORT = "test-results/ssr-vitest.json";

interface VitestAssertion {
  status?: string;
  fullName?: string;
  title?: string;
  failureMessages?: string[];
}
interface VitestFile {
  name?: string;
  status?: string;
  assertionResults?: VitestAssertion[];
}
interface VitestReport {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  testResults?: VitestFile[];
}

export interface SuiteArtifact {
  generatedAt: string;
  suite: "ssr-smoke" | "hydration-smoke";
  files: Array<{ file: string; status: string; tests: number; failed: number }>;
  failures: Array<{ file: string; test: string; message: string }>;
  summary: { pass: number; fail: number; notVerified: number };
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
}

export function isHydrationFile(name: string): boolean {
  return /hydration/i.test(name);
}

export function buildSuiteArtifact(
  report: VitestReport,
  suite: SuiteArtifact["suite"],
  now = new Date(),
): SuiteArtifact {
  const wanted = (report.testResults ?? []).filter((f) =>
    suite === "hydration-smoke" ? isHydrationFile(f.name ?? "") : !isHydrationFile(f.name ?? ""),
  );
  const files = wanted.map((f) => {
    const a = f.assertionResults ?? [];
    return {
      file: (f.name ?? "unknown").replace(`${process.cwd()}/`, ""),
      status: f.status ?? "unknown",
      tests: a.length,
      failed: a.filter((t) => t.status === "failed").length,
    };
  });
  const failures = wanted.flatMap((f) =>
    (f.assertionResults ?? [])
      .filter((t) => t.status === "failed")
      .map((t) => ({
        file: (f.name ?? "unknown").replace(`${process.cwd()}/`, ""),
        test: t.fullName ?? t.title ?? "unknown",
        message: (t.failureMessages ?? []).join("\n").slice(0, 500),
      })),
  );
  const pass = files.reduce((n, f) => n + (f.tests - f.failed), 0);
  const fail = failures.length;
  return {
    generatedAt: now.toISOString(),
    suite,
    files,
    failures,
    summary: { pass, fail, notVerified: files.length === 0 ? 1 : 0 },
    status: fail > 0 ? "FAIL" : files.length === 0 ? "NOT_VERIFIED" : "PASS",
  };
}

export async function main(): Promise<number> {
  mkdirSync("security-artifacts", { recursive: true });
  mkdirSync("test-results", { recursive: true });

  const proc = Bun.spawn(
    ["bunx", "vitest", "run", "tests/unit/ssr", "--reporter=json", `--outputFile=${REPORT}`],
    { stdout: "inherit", stderr: "inherit" },
  );
  const code = await proc.exited;

  const report: VitestReport = existsSync(REPORT)
    ? (JSON.parse(readFileSync(REPORT, "utf8")) as VitestReport)
    : {};

  const ssr = buildSuiteArtifact(report, "ssr-smoke");
  const hydration = buildSuiteArtifact(report, "hydration-smoke");
  writeFileSync(SSR_ARTIFACT, `${JSON.stringify(ssr, null, 2)}\n`);
  writeFileSync(HYDRATION_ARTIFACT, `${JSON.stringify(hydration, null, 2)}\n`);

  console.log(
    `ssr-smoke      : ${ssr.status} (${ssr.summary.pass} pass / ${ssr.summary.fail} fail) -> ${SSR_ARTIFACT}`,
  );
  console.log(
    `hydration-smoke: ${hydration.status} (${hydration.summary.pass} pass / ${hydration.summary.fail} fail) -> ${HYDRATION_ARTIFACT}`,
  );
  return code === 0 && ssr.status !== "FAIL" && hydration.status !== "FAIL" ? 0 : 1;
}

if (import.meta.main) {
  process.exit(await main());
}

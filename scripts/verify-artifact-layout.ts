#!/usr/bin/env bun
/**
 * Standardized security-artifacts/ layout gate.
 *
 * Every release-gating workflow must leave a complete, valid evidence set on
 * disk. This script verifies each required artifact:
 *   1. exists
 *   2. parses as JSON (for .json artifacts)
 *   3. is non-empty
 *   4. matches the expected schema shape
 *
 *   bun run verify:artifacts            # strict: every artifact required
 *   bun run verify:artifacts --optional graphql-row-scope.json,mobile-pwa.json
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const ARTIFACT_DIR = "security-artifacts";

export interface ArtifactSpec {
  file: string;
  kind: "json" | "markdown";
  /** Top-level keys that must be present in a JSON artifact. */
  requiredKeys?: string[];
  /** Substring that must appear in a markdown artifact. */
  mustContain?: string;
}

export const REQUIRED_ARTIFACTS: ArtifactSpec[] = [
  {
    file: "graphql-exposure.json",
    kind: "json",
    requiredKeys: ["generatedAt", "status", "summary"],
  },
  {
    file: "graphql-row-scope.json",
    kind: "json",
    requiredKeys: ["generatedAt", "status", "summary", "scope"],
  },
  { file: "production-smoke.json", kind: "json", requiredKeys: ["status", "stages"] },
  // Deployed-preview SSR + hydration evidence, one record per public route.
  {
    file: "preview-smoke.json",
    kind: "json",
    requiredKeys: ["generatedAt", "status", "summary", "routes"],
  },
  { file: "ssr-smoke.json", kind: "json", requiredKeys: ["generatedAt", "status", "summary"] },
  {
    file: "hydration-smoke.json",
    kind: "json",
    requiredKeys: ["generatedAt", "status", "summary"],
  },
  // The PWA suite records per-scenario observations, not generic "checks".
  { file: "mobile-pwa.json", kind: "json", requiredKeys: ["status", "observations"] },
  {
    file: "security-findings.json",
    kind: "json",
    requiredKeys: ["generatedAt", "status", "findings"],
  },
  { file: "security-evidence.md", kind: "markdown", mustContain: "Policy violations detected" },
  {
    file: "security-evidence.json",
    kind: "json",
    requiredKeys: ["generatedAt", "status", "tables"],
  },
];

export interface LayoutIssue {
  file: string;
  problem: string;
}

export function verifyArtifact(spec: ArtifactSpec, dir = ARTIFACT_DIR): LayoutIssue[] {
  const path = join(dir, spec.file);
  if (!existsSync(path))
    return [{ file: spec.file, problem: "missing — the producing stage did not run or failed" }];
  const size = statSync(path).size;
  if (size === 0) return [{ file: spec.file, problem: "empty file" }];
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return [{ file: spec.file, problem: "blank content" }];

  if (spec.kind === "markdown") {
    return spec.mustContain && !raw.includes(spec.mustContain)
      ? [{ file: spec.file, problem: `missing expected section: "${spec.mustContain}"` }]
      : [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return [{ file: spec.file, problem: `invalid JSON: ${String(err)}` }];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [{ file: spec.file, problem: "expected a JSON object at the top level" }];
  }
  const obj = parsed as Record<string, unknown>;
  if (Object.keys(obj).length === 0) return [{ file: spec.file, problem: "empty JSON object" }];
  const issues: LayoutIssue[] = [];
  for (const key of spec.requiredKeys ?? []) {
    if (!(key in obj)) issues.push({ file: spec.file, problem: `missing required key "${key}"` });
  }
  const status = obj["status"];
  if (typeof status === "string" && status === "FAIL") {
    issues.push({ file: spec.file, problem: "artifact reports status FAIL" });
  }
  return issues;
}

export function verifyLayout(
  specs: ArtifactSpec[] = REQUIRED_ARTIFACTS,
  optional: string[] = [],
  dir = ARTIFACT_DIR,
): { issues: LayoutIssue[]; skipped: string[] } {
  const issues: LayoutIssue[] = [];
  const skipped: string[] = [];
  for (const spec of specs) {
    if (optional.includes(spec.file) && !existsSync(join(dir, spec.file))) {
      skipped.push(spec.file);
      continue;
    }
    issues.push(...verifyArtifact(spec, dir));
  }
  return { issues, skipped };
}

function parseOptional(argv: string[]): string[] {
  const i = argv.indexOf("--optional");
  if (i === -1) return [];
  return (argv[i + 1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const optional = parseOptional(argv);
  const { issues, skipped } = verifyLayout(REQUIRED_ARTIFACTS, optional);

  console.log(`Artifact layout gate — ${ARTIFACT_DIR}/`);
  for (const spec of REQUIRED_ARTIFACTS) {
    const bad = issues.filter((i) => i.file === spec.file);
    const mark = skipped.includes(spec.file) ? "⏭️  skipped" : bad.length ? "❌ FAIL" : "✅ ok";
    console.log(
      `  ${mark}  ${spec.file}${bad.length ? ` — ${bad.map((b) => b.problem).join("; ")}` : ""}`,
    );
  }

  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) {
    const lines = [
      "### Security artifact layout",
      "",
      "| Artifact | Result |",
      "| --- | --- |",
      ...REQUIRED_ARTIFACTS.map((s) => {
        const bad = issues.filter((i) => i.file === s.file);
        const cell = skipped.includes(s.file)
          ? "⏭️ skipped (optional in this workflow)"
          : bad.length
            ? `❌ ${bad.map((b) => b.problem).join("; ")}`
            : "✅ present, valid";
        return `| \`${s.file}\` | ${cell} |`;
      }),
      "",
    ];
    const prev = await Bun.file(summary)
      .text()
      .catch(() => "");
    await Bun.write(summary, prev + lines.join("\n"));
  }

  for (const i of issues) console.error(`::error::[${i.file}] ${i.problem}`);
  if (issues.length) {
    console.error(`\nArtifact layout gate FAILED with ${issues.length} issue(s).`);
    return 1;
  }
  console.log("Artifact layout gate PASSED.");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}

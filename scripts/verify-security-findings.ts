#!/usr/bin/env bun
/**
 * Release-gate check for the accepted GraphQL exposure finding.
 *
 * `SUPA_pg_graphql_authenticated_table_exposed` is a formally accepted,
 * RLS-protected trade-off. Acceptance is only valid while the conditions that
 * justified it still hold. This gate fails the release when:
 *
 *   1. the dismissal record is missing, expired, or lost its evidence;
 *   2. the finding's shape changed — a new table became GraphQL-exposed, an
 *      anon grant appeared, RLS was disabled, or a policy stopped being scoped
 *      to auth.uid();
 *   3. the evidence report cannot be produced.
 *
 *   bun run security:findings
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  enforcesAuthUid,
  loadSnapshot,
  rowScopeStatuses,
  type Snapshot,
  type TableRecord,
} from "./generate-security-evidence";
import { loadSecurityMemory, validateSecurityMemory } from "./verify-security-memory";

export const GATED_FINDING = "SUPA_pg_graphql_authenticated_table_exposed";
export const FINDINGS_PATH = "security-artifacts/security-findings.json";
export const EVIDENCE_MD = "security-artifacts/security-evidence.md";
export const ROW_SCOPE_PATH = "security-artifacts/graphql-row-scope.json";

/** The exposure surface accepted at review time. Growth must be re-reviewed. */
export const ACCEPTED_EXPOSED_TABLES = [
  "badges",
  "chats",
  "memories",
  "messages",
  "missions",
  "profiles",
  "streaks",
  "subscriptions",
  "usage_daily",
  "user_xp",
  "xp_events",
] as const;

export interface GateIssue {
  check: string;
  problem: string;
  table?: string;
  detected?: string;
}

export interface FindingRecord {
  internal_id: string;
  title: string;
  severity: "HIGH" | "WARN" | "INFO";
  disposition: "accepted" | "open";
  allowlist: string[];
  exposedTables: string[];
  unexpectedTables: string[];
  rlsCoverage: Record<string, boolean>;
  authUidCoverage: Record<string, boolean>;
}

export interface FindingsArtifact {
  generatedAt: string;
  project: string | null;
  snapshotCapturedAt: string;
  findings: FindingRecord[];
  status: "PASS" | "FAIL";
  issues: GateIssue[];
}

/**
 * Derives the machine-readable findings artifact from the live policy snapshot.
 * This is the file the release gate reads, so it is always regenerated first —
 * a stale artifact can never mask a real regression.
 */
export function buildFindingsArtifact(
  s: Snapshot,
  issues: GateIssue[],
  now = new Date(),
): FindingsArtifact {
  const exposed = s.tables
    .filter((t) => t.exposure === "authenticated")
    .map((t) => t.table)
    .sort();
  const allowlist = [...ACCEPTED_EXPOSED_TABLES].sort();
  return {
    generatedAt: now.toISOString(),
    project: s.project,
    snapshotCapturedAt: s.capturedAt,
    findings: [
      {
        internal_id: GATED_FINDING,
        title: "pg_graphql exposes user-owned tables to the authenticated role",
        severity: "WARN",
        disposition: issues.length ? "open" : "accepted",
        allowlist,
        exposedTables: exposed,
        unexpectedTables: exposed.filter((t) => !allowlist.includes(t)),
        rlsCoverage: Object.fromEntries(s.tables.map((t) => [t.table, t.rlsEnabled])),
        authUidCoverage: Object.fromEntries(s.tables.map((t) => [t.table, enforcesAuthUid(t)])),
      },
    ],
    status: issues.length ? "FAIL" : "PASS",
    issues,
  };
}

export function writeFindingsArtifact(a: FindingsArtifact, path = FINDINGS_PATH): void {
  mkdirSync("security-artifacts", { recursive: true });
  writeFileSync(path, `${JSON.stringify(a, null, 2)}\n`);
}

/**
 * Every exposed table must be provable: present in the evidence report and
 * covered by the live row-scope auditor artifact.
 */
export function checkEvidenceCoverage(tables: TableRecord[]): GateIssue[] {
  const issues: GateIssue[] = [];
  const md = existsSync(EVIDENCE_MD) ? readFileSync(EVIDENCE_MD, "utf8") : "";
  const scope = rowScopeStatuses(ROW_SCOPE_PATH);
  const haveScopeArtifact = existsSync(ROW_SCOPE_PATH);
  for (const t of tables.filter((t) => t.exposure === "authenticated")) {
    if (!md.includes(`\`${t.table}\``)) {
      issues.push({
        check: "evidence-coverage",
        table: t.table,
        detected: "absent from security-evidence.md",
        problem: `exposed table "${t.table}" is missing from ${EVIDENCE_MD} — regenerate with \`bun run security:evidence\``,
      });
    }
    if (haveScopeArtifact && scope[t.table] === "FAIL") {
      issues.push({
        check: "row-scope",
        table: t.table,
        detected: "cross-user rows returned by the live GraphQL probe",
        problem: `exposed table "${t.table}" failed live auth.uid() row isolation`,
      });
    }
    if (haveScopeArtifact && scope[t.table] === undefined) {
      issues.push({
        check: "row-scope",
        table: t.table,
        detected: "absent from graphql-row-scope.json",
        problem: `exposed table "${t.table}" was never probed by the row-scope auditor`,
      });
    }
  }
  return issues;
}

/** Service-only tables must never gain a client grant. */
export function checkServiceOnly(tables: TableRecord[]): GateIssue[] {
  return tables
    .filter((t) => t.exposure === "service_only" && (t.grants["authenticated"] || t.grants["anon"]))
    .map((t) => ({
      check: "service-only",
      table: t.table,
      detected: `grants ${t.grants["authenticated"] ?? t.grants["anon"]} to a client role`,
      problem: `service-only table "${t.table}" became client-reachable — remove the GRANT or re-review the finding`,
    }));
}

export function checkExposureShape(tables: TableRecord[]): GateIssue[] {
  const issues: GateIssue[] = [];
  const exposed = tables
    .filter((t) => t.exposure === "authenticated")
    .map((t) => t.table)
    .sort();
  const accepted = [...ACCEPTED_EXPOSED_TABLES].sort();

  for (const t of exposed.filter((t) => !accepted.includes(t))) {
    issues.push({
      check: "exposure-surface",
      problem: `table "${t}" is newly exposed to the authenticated role and was never reviewed — the accepted finding no longer describes reality`,
    });
  }
  for (const t of accepted.filter((t) => !exposed.includes(t))) {
    issues.push({
      check: "exposure-surface",
      problem: `accepted table "${t}" is no longer exposed — update ACCEPTED_EXPOSED_TABLES and the dismissal rationale`,
    });
  }
  for (const t of tables) {
    if (!t.rlsEnabled) {
      issues.push({ check: "rls", problem: `RLS is disabled on public.${t.table}` });
    }
    if (t.grants["anon"]) {
      issues.push({
        check: "anon-grant",
        problem: `public.${t.table} grants ${t.grants["anon"]} to anon — acceptance assumed zero anonymous reach`,
      });
    }
    if (!enforcesAuthUid(t)) {
      issues.push({
        check: "auth-uid-scope",
        problem: `public.${t.table} has a client policy that is not scoped to auth.uid()`,
      });
    }
  }
  return issues;
}

export function checkDismissal(now = new Date()): GateIssue[] {
  const issues: GateIssue[] = [];
  const memory = loadSecurityMemory();
  const validation = validateSecurityMemory(memory, now);
  for (const i of validation.issues) {
    issues.push({
      check: "security-memory",
      problem: `${i.internal_id ?? "record"}: ${i.problem}`,
    });
  }
  const records = (memory as { dismissals?: Array<{ internal_id?: string }> }).dismissals ?? [];
  if (!records.some((r) => r.internal_id === GATED_FINDING)) {
    issues.push({
      check: "dismissal",
      problem: `${GATED_FINDING} reappeared without an accepted, in-date dismissal record — review it before releasing`,
    });
  }
  return issues;
}

export function checkEvidence(): GateIssue[] {
  const path = "security-artifacts/security-evidence.md";
  if (!existsSync(path)) {
    return [{ check: "evidence", problem: `missing ${path} — run \`bun run security:evidence\`` }];
  }
  const md = readFileSync(path, "utf8");
  return md.includes("Policy violations detected: **0**")
    ? []
    : [{ check: "evidence", problem: "the evidence report records at least one policy violation" }];
}

export async function main(): Promise<number> {
  const snapshot = loadSnapshot();
  const issues = [
    ...checkDismissal(),
    ...checkExposureShape(snapshot.tables),
    ...checkServiceOnly(snapshot.tables),
    ...checkEvidenceCoverage(snapshot.tables),
    ...checkEvidence(),
  ];
  writeFindingsArtifact(buildFindingsArtifact(snapshot, issues));

  console.log(`Finding gate — ${GATED_FINDING}`);
  console.log(`  exposed tables : ${ACCEPTED_EXPOSED_TABLES.length} accepted`);
  console.log(`  snapshot       : ${snapshot.capturedAt} (${snapshot.source})`);
  console.log(`  findings       : ${FINDINGS_PATH}`);

  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) {
    const lines = [
      "### GraphQL finding gate",
      "",
      issues.length
        ? [
            "**FAILED: Unauthorized GraphQL exposure detected**",
            "",
            ...issues.flatMap((i) => [
              `- Affected table: \`${i.table ?? "n/a"}\``,
              `  - Check: \`${i.check}\``,
              "  - Expected: Owner-scoped RLS with `auth.uid()`",
              `  - Detected: ${i.detected ?? i.problem}`,
              "  - Required remediation: remove the GraphQL exposure **OR** add `auth.uid()`-scoped RLS **OR** add the table to the approved allowlist after security review.",
            ]),
          ].join("\n")
        : `- ✅ \`${GATED_FINDING}\` remains an accepted, RLS-protected trade-off with in-date evidence.`,
      "",
    ];
    await Bun.write(
      summary,
      (await Bun.file(summary)
        .text()
        .catch(() => "")) + lines.join("\n"),
    );
  }

  if (issues.length) {
    console.error("FAILED: Unauthorized GraphQL exposure detected");
    for (const i of issues) {
      console.error(`::error::[${i.check}] ${i.problem}`);
      console.error(`  Affected table: ${i.table ?? "n/a"}`);
      console.error("  Expected: Owner-scoped RLS with auth.uid()");
      console.error(`  Detected: ${i.detected ?? i.problem}`);
      console.error(
        "  Required remediation: remove GraphQL exposure OR add auth.uid()-scoped RLS OR add the table to the approved allowlist after review",
      );
    }
    console.error(`\nFinding gate FAILED with ${issues.length} issue(s).`);
    return 1;
  }
  console.log("Finding gate PASSED.");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}

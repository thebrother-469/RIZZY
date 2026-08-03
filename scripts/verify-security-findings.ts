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
import { existsSync, readFileSync } from "node:fs";
import { enforcesAuthUid, loadSnapshot, type TableRecord } from "./generate-security-evidence";
import { loadSecurityMemory, validateSecurityMemory } from "./verify-security-memory";

export const GATED_FINDING = "SUPA_pg_graphql_authenticated_table_exposed";

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
    issues.push({ check: "security-memory", problem: `${i.internal_id ?? "record"}: ${i.problem}` });
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
    ...checkEvidence(),
  ];

  console.log(`Finding gate — ${GATED_FINDING}`);
  console.log(`  exposed tables : ${ACCEPTED_EXPOSED_TABLES.length} accepted`);
  console.log(`  snapshot       : ${snapshot.capturedAt} (${snapshot.source})`);

  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) {
    const lines = [
      "### GraphQL finding gate",
      "",
      issues.length
        ? issues.map((i) => `- ❌ \`${i.check}\` — ${i.problem}`).join("\n")
        : `- ✅ \`${GATED_FINDING}\` remains an accepted, RLS-protected trade-off with in-date evidence.`,
      "",
    ];
    await Bun.write(
      summary,
      (await Bun.file(summary).text().catch(() => "")) + lines.join("\n"),
    );
  }

  for (const i of issues) console.error(`::error::[${i.check}] ${i.problem}`);
  if (issues.length) {
    console.error(`\nFinding gate FAILED with ${issues.length} issue(s).`);
    return 1;
  }
  console.log("Finding gate PASSED.");
  return 0;
}

if (import.meta.main) {
  process.exit(await main());
}

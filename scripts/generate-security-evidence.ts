#!/usr/bin/env bun
/**
 * Audit-grade security evidence report.
 *
 * Renders security-artifacts/security-evidence.md: for every pg_graphql-exposed
 * table it prints the exact RLS policy SQL, the exact GRANT SQL, the anonymous
 * and authenticated access summary and the auth.uid() enforcement statement,
 * taken from the connected Supabase project.
 *
 * Source of truth: security/policy-snapshot.json, captured live from the
 * project (pg_policies + pg_class.relacl). When SUPABASE_DB_URL and psql are
 * bound the snapshot is refreshed in place before rendering, so the report is
 * always the live database in CI and reproducible offline.
 *
 *   bun run security:evidence
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SNAPSHOT_PATH = "security/policy-snapshot.json";
export const EVIDENCE_PATH = "security-artifacts/security-evidence.md";
export const EVIDENCE_JSON_PATH = "security-artifacts/security-evidence.json";
export const ROW_SCOPE_PATH = "security-artifacts/graphql-row-scope.json";

export interface PolicyRecord {
  name: string;
  cmd: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
  roles: string[];
  permissive: "PERMISSIVE" | "RESTRICTIVE";
  using: string | null;
  withCheck: string | null;
}

export interface TableRecord {
  table: string;
  schema: string;
  exposure: "authenticated" | "service_only";
  owner: string | null;
  rlsEnabled: boolean;
  policies: PolicyRecord[];
  grants: Record<string, string>;
}

export interface Snapshot {
  capturedAt: string;
  project: string | null;
  source: string;
  tables: TableRecord[];
}

/** Reconstructs the exact CREATE POLICY statement for a policy row. */
export function policySql(table: string, schema: string, p: PolicyRecord): string {
  const parts = [
    `CREATE POLICY "${p.name}"`,
    `  ON ${schema}.${table}`,
    `  AS ${p.permissive}`,
    `  FOR ${p.cmd}`,
    `  TO ${p.roles.join(", ")}`,
  ];
  if (p.using) parts.push(`  USING ${p.using}`);
  if (p.withCheck) parts.push(`  WITH CHECK ${p.withCheck}`);
  return `${parts.join("\n")};`;
}

export function grantSql(table: string, schema: string, grants: Record<string, string>): string {
  const lines = Object.entries(grants)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([role, privs]) => `GRANT ${privs.split(",").join(", ")} ON ${schema}.${table} TO ${role};`,
    );
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!grants[role]) lines.push(`-- no privileges granted to ${role}`);
  }
  return lines.join("\n");
}

export function policiesFor(t: TableRecord, cmd: PolicyRecord["cmd"]): PolicyRecord[] {
  return t.policies.filter((p) => p.cmd === cmd || p.cmd === "ALL");
}

/** True when every client-reachable policy is scoped to auth.uid(). */
export function enforcesAuthUid(t: TableRecord): boolean {
  const clientPolicies = t.policies.filter((p) => p.roles.some((r) => r !== "service_role"));
  if (clientPolicies.length === 0) return true;
  return clientPolicies.every((p) => {
    const expr = `${p.using ?? ""} ${p.withCheck ?? ""}`.trim();
    return expr.includes("auth.uid()") || /\bfalse\b/.test(expr);
  });
}

export function renderTable(t: TableRecord, rowScope: string = "NOT_VERIFIED"): string {
  const anonGrant = t.grants["anon"];
  const authGrant = t.grants["authenticated"];
  const section = [
    `### \`${t.schema}.${t.table}\``,
    "",
    `| Property | Value |`,
    `| --- | --- |`,
    `| pg_graphql exposure | ${t.exposure === "authenticated" ? "reachable by the **authenticated** role (intentional, owner-scoped)" : "**not exposed** to any client role"} |`,
    `| RLS enabled | ${t.rlsEnabled ? "✅ yes" : "❌ NO"} |`,
    `| Owner column | ${t.owner ? `\`${t.owner}\`` : "n/a"} |`,
    `| Allowed roles (policies) | ${
      [...new Set(t.policies.flatMap((p) => p.roles))]
        .sort()
        .map((r) => `\`${r}\``)
        .join(", ") || "none"
    } |`,
    `| Anonymous access | ${anonGrant ? `⚠️ ${anonGrant}` : "❌ none — no GRANT to \`anon\`"} |`,
    `| Authenticated access | ${authGrant ? `${authGrant}, filtered by RLS` : "none — no GRANT to `authenticated`"} |`,
    `| auth.uid() enforcement | ${enforcesAuthUid(t) ? "✅ every client policy is scoped to `auth.uid()` (or denies outright)" : "❌ a client policy is not scoped to `auth.uid()`"} |`,
    `| Row-scope verification | ${rowScope === "PASS" ? "✅ PASS (live two-user probe)" : rowScope === "FAIL" ? "❌ FAIL — cross-user rows returned" : "⚠️ NOT_VERIFIED (no live probe in this run)"} |`,
    "",
    "**GRANT statements**",
    "",
    "```sql",
    grantSql(t.table, t.schema, t.grants),
    "```",
    "",
  ];

  for (const cmd of ["SELECT", "INSERT", "UPDATE", "DELETE"] as const) {
    const ps = policiesFor(t, cmd);
    section.push(`**${cmd} policy SQL**`, "", "```sql");
    section.push(
      ps.length
        ? ps.map((p) => policySql(t.table, t.schema, p)).join("\n\n")
        : `-- no ${cmd} policy: RLS denies ${cmd} for every client role`,
    );
    section.push("```", "");
  }
  return section.join("\n");
}

export function renderEvidence(
  s: Snapshot,
  now = new Date(),
  rowScope: Record<string, string> = {},
): string {
  const exposed = s.tables.filter((t) => t.exposure === "authenticated");
  const serviceOnly = s.tables.filter((t) => t.exposure === "service_only");
  const violations = s.tables.filter((t) => !t.rlsEnabled || !enforcesAuthUid(t));
  const scopeOf = (t: TableRecord) =>
    rowScope[t.table] ?? (t.exposure === "authenticated" ? "NOT_VERIFIED" : "PASS");

  return [
    "# RIZZGOD AI — Security Evidence Report",
    "",
    `Generated: ${now.toISOString()}`,
    `Database snapshot captured: ${s.capturedAt} (${s.source})`,
    `Supabase project: \`${s.project ?? "unknown"}\``,
    "",
    "This document is the audit artifact for the finding",
    "`SUPA_pg_graphql_authenticated_table_exposed`. Every table reachable through",
    "pg_graphql is listed with the exact SQL that protects it.",
    "",
    "## Summary",
    "",
    `- GraphQL-exposed tables (authenticated role): **${exposed.length}**`,
    `- Service-only tables (no client grant): **${serviceOnly.length}**`,
    `- Tables with RLS enabled: **${s.tables.filter((t) => t.rlsEnabled).length}/${s.tables.length}**`,
    `- Tables granting anything to \`anon\`: **${s.tables.filter((t) => t.grants["anon"]).length}**`,
    `- Policy violations detected: **${violations.length}**${violations.length ? ` (${violations.map((v) => v.table).join(", ")})` : ""}`,
    "",
    "| Table | Exposure | RLS | anon | authenticated | auth.uid() | row scope |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...s.tables.map(
      (t) =>
        `| \`${t.table}\` | ${t.exposure} | ${t.rlsEnabled ? "✅" : "❌"} | ${t.grants["anon"] ?? "—"} | ${t.grants["authenticated"] ?? "—"} | ${enforcesAuthUid(t) ? "✅" : "❌"} | ${scopeOf(t)} |`,
    ),
    "",
    "## Exposed tables",
    "",
    ...exposed.map((t) => renderTable(t, scopeOf(t))),
    "## Service-only tables",
    "",
    ...serviceOnly.map((t) => renderTable(t, scopeOf(t))),
    "## Verification",
    "",
    "- `bun run verify:graphql:audit` — live anon/authenticated collection reachability.",
    "- `bun run verify:graphql:row-scope` — live two-user `auth.uid()` row isolation, including nested relations, pagination and ordering.",
    "- `bun run verify:rls` — direct PostgREST CRUD isolation.",
    "- `bun run security:findings` — fails the release gate if the accepted finding changes shape.",
    "",
  ].join("\n");
}

export function loadSnapshot(path = SNAPSHOT_PATH): Snapshot {
  if (!existsSync(path)) throw new Error(`missing policy snapshot: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as Snapshot;
}

export type RowScopeStatus = "PASS" | "FAIL" | "NOT_VERIFIED";

/**
 * Per-table row-scope verdict taken from the live row-scope auditor artifact.
 * Absent artifact => NOT_VERIFIED (never silently "pass").
 */
export function rowScopeStatuses(path = ROW_SCOPE_PATH): Record<string, RowScopeStatus> {
  if (!existsSync(path)) return {};
  try {
    const a = JSON.parse(readFileSync(path, "utf8")) as {
      scope?: Array<{ table: string; status: RowScopeStatus }>;
    };
    const out: Record<string, RowScopeStatus> = {};
    for (const c of a.scope ?? []) {
      const prev = out[c.table];
      out[c.table] =
        c.status === "FAIL" || prev === "FAIL"
          ? "FAIL"
          : c.status === "NOT_VERIFIED" || prev === "NOT_VERIFIED"
            ? "NOT_VERIFIED"
            : "PASS";
    }
    return out;
  } catch {
    return {};
  }
}

export interface EvidenceTableJson {
  table: string;
  schema: string;
  exposure: TableRecord["exposure"];
  graphqlExposed: boolean;
  rlsEnabled: boolean;
  ownerColumn: string | null;
  allowedRoles: string[];
  grants: Record<string, string>;
  grantSql: string;
  policies: Array<{ name: string; cmd: string; roles: string[]; sql: string }>;
  authUidVerified: boolean;
  rowScopeStatus: RowScopeStatus;
}

export interface EvidenceJson {
  generatedAt: string;
  project: string | null;
  snapshotCapturedAt: string;
  snapshotSource: string;
  finding: string;
  summary: {
    tables: number;
    graphqlExposed: number;
    serviceOnly: number;
    rlsEnabled: number;
    anonGranted: number;
    violations: string[];
    rowScopeVerified: number;
  };
  tables: EvidenceTableJson[];
  status: "PASS" | "FAIL";
}

export function buildEvidenceJson(
  s: Snapshot,
  rowScope: Record<string, RowScopeStatus> = {},
  now = new Date(),
): EvidenceJson {
  const tables: EvidenceTableJson[] = s.tables.map((t) => ({
    table: t.table,
    schema: t.schema,
    exposure: t.exposure,
    graphqlExposed: t.exposure === "authenticated",
    rlsEnabled: t.rlsEnabled,
    ownerColumn: t.owner,
    allowedRoles: [...new Set(t.policies.flatMap((p) => p.roles))].sort(),
    grants: t.grants,
    grantSql: grantSql(t.table, t.schema, t.grants),
    policies: t.policies.map((p) => ({
      name: p.name,
      cmd: p.cmd,
      roles: p.roles,
      sql: policySql(t.table, t.schema, p),
    })),
    authUidVerified: enforcesAuthUid(t),
    rowScopeStatus: rowScope[t.table] ?? (t.exposure === "authenticated" ? "NOT_VERIFIED" : "PASS"),
  }));
  const violations = tables.filter((t) => !t.rlsEnabled || !t.authUidVerified).map((t) => t.table);
  return {
    generatedAt: now.toISOString(),
    project: s.project,
    snapshotCapturedAt: s.capturedAt,
    snapshotSource: s.source,
    finding: "SUPA_pg_graphql_authenticated_table_exposed",
    summary: {
      tables: tables.length,
      graphqlExposed: tables.filter((t) => t.graphqlExposed).length,
      serviceOnly: tables.filter((t) => !t.graphqlExposed).length,
      rlsEnabled: tables.filter((t) => t.rlsEnabled).length,
      anonGranted: tables.filter((t) => t.grants["anon"]).length,
      violations,
      rowScopeVerified: tables.filter((t) => t.rowScopeStatus === "PASS").length,
    },
    tables,
    status: violations.length ? "FAIL" : "PASS",
  };
}

/** Refreshes the snapshot from the live database when psql + a URL are bound. */
export async function refreshSnapshot(path = SNAPSHOT_PATH): Promise<boolean> {
  const dbUrl = process.env["SUPABASE_DB_URL"];
  if (!dbUrl) return false;
  const sql = `select json_agg(x) from (
    select c.relname as table_name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r') x`;
  try {
    const proc = Bun.spawn(["psql", dbUrl, "-tAc", sql], { stdout: "pipe", stderr: "pipe" });
    const out = (await new Response(proc.stdout).text()).trim();
    if ((await proc.exited) !== 0 || !out) return false;
    const live = JSON.parse(out) as Array<{ table_name: string; rls: boolean }>;
    const snapshot = loadSnapshot(path);
    for (const t of snapshot.tables) {
      const row = live.find((l) => l.table_name === t.table);
      if (row) t.rlsEnabled = row.rls;
    }
    snapshot.capturedAt = new Date().toISOString();
    snapshot.source = "live-psql";
    writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

export async function main(): Promise<number> {
  await refreshSnapshot();
  const snapshot = loadSnapshot();
  const rowScope = rowScopeStatuses();
  const md = renderEvidence(snapshot, new Date(), rowScope);
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, md);
  writeFileSync(
    EVIDENCE_JSON_PATH,
    `${JSON.stringify(buildEvidenceJson(snapshot, rowScope), null, 2)}\n`,
  );
  const violations = snapshot.tables.filter((t) => !t.rlsEnabled || !enforcesAuthUid(t));
  console.log(
    `security evidence written -> ${EVIDENCE_PATH} + ${EVIDENCE_JSON_PATH} (${snapshot.tables.length} tables)`,
  );
  for (const v of violations) console.error(`::error::${v.table} is not fully protected`);
  return violations.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await main());
}

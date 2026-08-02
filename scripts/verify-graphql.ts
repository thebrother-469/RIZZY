#!/usr/bin/env bun
/**
 * Automated pg_graphql exposure audit.
 *
 * Executes REAL GraphQL queries against the connected Supabase project with
 * the anonymous role and (when credentials are bound) an authenticated role,
 * then compares the observed exposure surface against a declared allowlist.
 *
 * Emits a machine-readable artifact at security-artifacts/graphql-exposure.json.
 *
 *   bun run verify:graphql:audit
 *
 * Exit code 1 on ANY exposure regression.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveEnv, passwordSignIn } from "./e2e-env";

export const ARTIFACT_PATH = "security-artifacts/graphql-exposure.json";
const GRAPHQL_PATH = "/graphql/v1";

/**
 * Collections the authenticated role is allowed to reach. Every one of these
 * is row-level-secured to `auth.uid()`; reachability is intentional because
 * the browser client queries them directly through PostgREST/pg_graphql.
 */
export const AUTHENTICATED_ALLOWLIST = [
  "profiles",
  "chats",
  "messages",
  "memories",
  "missions",
  "subscriptions",
  "user_xp",
  "streaks",
  "badges",
  "usage_daily",
  "xp_events",
] as const;

/**
 * Service-only surface: webhook ledgers, audit trails, debug event streams
 * and internal quota tables. Neither anon nor authenticated may reach these.
 */
export const SERVICE_ONLY_TABLES = [
  "lemonsqueezy_webhook_events",
  "paddle_webhook_events",
  "auth_audit_logs",
  "onboarding_debug_events",
  "daily_mission_debug_events",
  "profile_gen_usage",
] as const;

/** The anon role may reach nothing at all. */
export const ANON_FORBIDDEN_TABLES = [
  ...AUTHENTICATED_ALLOWLIST,
  ...SERVICE_ONLY_TABLES,
] as const;

export type CheckStatus = "PASS" | "FAIL" | "NOT_VERIFIED";

export interface ExposureCheck {
  role: "anon" | "authenticated";
  table: string;
  collection: string;
  expected: "hidden" | "owner_scoped";
  observed: "hidden" | "empty" | "rows" | "error";
  rowCount: number | null;
  status: CheckStatus;
  query: string;
  detail: string;
}

export interface GraphqlResponse {
  data?: unknown;
  errors?: Array<{ message: string }>;
}

export function collectionName(table: string): string {
  return `${table}Collection`;
}

export async function runGraphql(
  baseUrl: string,
  apikey: string,
  bearer: string,
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GraphqlResponse> {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${GRAPHQL_PATH}`, {
    method: "POST",
    headers: { apikey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await res.json()) as GraphqlResponse;
}

/** pg_graphql omits the field entirely when the role has no SELECT grant. */
export function isHidden(res: GraphqlResponse, collection: string): boolean {
  return (res.errors ?? []).some((e) => e.message.includes(`Unknown field "${collection}"`));
}

export function edgeCount(res: GraphqlResponse, collection: string): number | null {
  const data = res.data as Record<string, { edges?: unknown[] } | undefined> | null | undefined;
  const edges = data?.[collection]?.edges;
  return Array.isArray(edges) ? edges.length : null;
}

/**
 * Classifies a single probe against the declared expectation.
 * `hidden`       — the collection must not exist for this role.
 * `owner_scoped` — the collection may exist, but every returned row must
 *                  belong to the caller (checked by the caller via ownerIds).
 */
export function classify(
  role: "anon" | "authenticated",
  table: string,
  expected: "hidden" | "owner_scoped",
  res: GraphqlResponse,
  query: string,
  foreignRows = 0,
): ExposureCheck {
  const collection = collectionName(table);
  const hidden = isHidden(res, collection);
  const count = edgeCount(res, collection);
  const observed: ExposureCheck["observed"] = hidden
    ? "hidden"
    : count === null
      ? "error"
      : count === 0
        ? "empty"
        : "rows";

  let status: CheckStatus;
  let detail: string;
  if (expected === "hidden") {
    status = hidden || observed === "empty" ? "PASS" : "FAIL";
    detail = hidden
      ? "collection is not exposed (no SELECT grant)"
      : observed === "empty"
        ? "collection exposed but RLS returned zero rows"
        : observed === "error"
          ? `unexpected response: ${JSON.stringify(res.errors ?? res.data).slice(0, 200)}`
          : `EXPOSURE REGRESSION: ${count} row(s) returned to ${role}`;
  } else {
    status = hidden ? "FAIL" : foreignRows > 0 ? "FAIL" : "PASS";
    detail = hidden
      ? "allowlisted collection is no longer reachable — product regression"
      : foreignRows > 0
        ? `RLS LEAK: ${foreignRows} row(s) not owned by the caller`
        : `reachable and owner-scoped (${count ?? 0} own row(s))`;
  }
  return { role, table, collection, expected, observed, rowCount: count, status, query, detail };
}

function probeQuery(table: string, fields: string): string {
  return `{ ${collectionName(table)}(first: 5) { edges { node { ${fields} } } } }`;
}

/** Column used to prove ownership for each allowlisted collection. */
const OWNER_COLUMN: Record<string, string> = {
  profiles: "id",
  chats: "user_id",
  messages: "user_id",
  memories: "user_id",
  missions: "user_id",
  subscriptions: "user_id",
  user_xp: "user_id",
  streaks: "user_id",
  badges: "user_id",
  usage_daily: "user_id",
  xp_events: "user_id",
};

export async function auditAnon(
  baseUrl: string,
  anonKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExposureCheck[]> {
  const out: ExposureCheck[] = [];
  for (const table of ANON_FORBIDDEN_TABLES) {
    const query = probeQuery(table, "nodeId");
    const res = await runGraphql(baseUrl, anonKey, anonKey, query, fetchImpl);
    out.push(classify("anon", table, "hidden", res, query));
  }
  return out;
}

export async function auditAuthenticated(
  baseUrl: string,
  anonKey: string,
  accessToken: string,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExposureCheck[]> {
  const out: ExposureCheck[] = [];

  for (const table of AUTHENTICATED_ALLOWLIST) {
    const owner = OWNER_COLUMN[table];
    const query = probeQuery(table, `nodeId ${owner}`);
    const res = await runGraphql(baseUrl, anonKey, accessToken, query, fetchImpl);
    const data = res.data as
      | Record<string, { edges?: Array<{ node: Record<string, unknown> }> } | undefined>
      | null
      | undefined;
    const edges = data?.[collectionName(table)]?.edges ?? [];
    const foreign = edges.filter((e) => String(e.node?.[owner]) !== userId).length;
    out.push(classify("authenticated", table, "owner_scoped", res, query, foreign));
  }

  for (const table of SERVICE_ONLY_TABLES) {
    const query = probeQuery(table, "nodeId");
    const res = await runGraphql(baseUrl, anonKey, accessToken, query, fetchImpl);
    out.push(classify("authenticated", table, "hidden", res, query));
  }
  return out;
}

export interface AuditArtifact {
  generatedAt: string;
  project: string | null;
  allowlist: { authenticated: string[]; serviceOnly: string[] };
  summary: { pass: number; fail: number; notVerified: number };
  checks: ExposureCheck[];
  blockers: string[];
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
}

export function buildArtifact(
  checks: ExposureCheck[],
  blockers: string[],
  project: string | null,
  now = new Date(),
): AuditArtifact {
  const pass = checks.filter((c) => c.status === "PASS").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  const notVerified = checks.filter((c) => c.status === "NOT_VERIFIED").length + blockers.length;
  return {
    generatedAt: now.toISOString(),
    project,
    allowlist: {
      authenticated: [...AUTHENTICATED_ALLOWLIST],
      serviceOnly: [...SERVICE_ONLY_TABLES],
    },
    summary: { pass, fail, notVerified },
    checks,
    blockers,
    status: fail > 0 ? "FAIL" : blockers.length > 0 ? "NOT_VERIFIED" : "PASS",
  };
}

export function writeArtifact(artifact: AuditArtifact, path = ARTIFACT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(artifact, null, 2)}\n`);
}

export async function main(): Promise<number> {
  const e = resolveEnv();
  const checks: ExposureCheck[] = [];
  const blockers: string[] = [];
  const project = e.url?.match(/https?:\/\/([^.]+)\./)?.[1] ?? null;

  if (!e.url || !e.anonKey) {
    blockers.push(
      "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not bound to this runtime — anon audit could not execute.",
    );
  } else {
    checks.push(...(await auditAnon(e.url, e.anonKey)));

    const grant = await passwordSignIn(e);
    if (!grant.session) {
      blockers.push(
        `Authenticated audit could not execute: password grant failed (HTTP ${grant.status}${
          grant.errorCode ? `, ${grant.errorCode}` : ""
        }). Bind E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD.`,
      );
    } else {
      checks.push(
        ...(await auditAuthenticated(
          e.url,
          e.anonKey,
          grant.session.access_token,
          grant.session.user.id,
        )),
      );
    }
  }

  const artifact = buildArtifact(checks, blockers, project);
  writeArtifact(artifact);

  for (const c of checks) {
    console.log(`[${c.status}] ${c.role} :: ${c.collection} — ${c.detail}`);
  }
  for (const b of blockers) console.log(`[NOT_VERIFIED] ${b}`);
  console.log(
    `\nsummary: ${artifact.summary.pass} PASS, ${artifact.summary.fail} FAIL, ` +
      `${artifact.summary.notVerified} NOT VERIFIED -> ${ARTIFACT_PATH}`,
  );
  return artifact.status === "FAIL" ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await main());
}
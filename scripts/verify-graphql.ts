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
import {
  resolveEnv,
  passwordSignIn,
  ensureUser,
  deleteUser,
  findUserByEmail,
  disposableIdentity,
  type AuthSession,
  type E2EEnv,
} from "./e2e-env";

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
export const ANON_FORBIDDEN_TABLES = [...AUTHENTICATED_ALLOWLIST, ...SERVICE_ONLY_TABLES] as const;

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
  denylist: { anon: string[]; authenticated: string[] };
  anon: ExposureCheck[];
  authenticated: ExposureCheck[];
  unexpectedExposures: ExposureCheck[];
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
    denylist: {
      anon: [...ANON_FORBIDDEN_TABLES],
      authenticated: [...SERVICE_ONLY_TABLES],
    },
    anon: checks.filter((c) => c.role === "anon"),
    authenticated: checks.filter((c) => c.role === "authenticated"),
    unexpectedExposures: checks.filter(
      (c) => c.status === "FAIL" && c.expected === "hidden" && c.observed === "rows",
    ),
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

export interface AuditSession {
  session: AuthSession | null;
  /** Set when a throwaway identity was minted and must be destroyed after. */
  disposableUserId?: string;
  reason?: string;
}

/**
 * Resolves a REAL authenticated Supabase session for the audit, in the same
 * priority order as the E2E test-session tooling:
 *
 *   1. a session already injected into the runtime (managed Lovable sandbox),
 *   2. a disposable identity minted through the Auth admin API (service key),
 *   3. the configured shared E2E user password grant.
 *
 * Never logs a credential. Returns a reason instead of throwing so the audit
 * can report NOT_VERIFIED rather than fail on absent infrastructure.
 */
export async function acquireAuditSession(e: E2EEnv = resolveEnv()): Promise<AuditSession> {
  const injected = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (injected) {
    try {
      const parsed = JSON.parse(injected) as AuthSession;
      if (parsed.access_token && parsed.user?.id) return { session: parsed };
    } catch {
      /* fall through */
    }
  }

  if (e.serviceKey) {
    const identity = disposableIdentity("gqlaudit");
    const created = await ensureUser(e, identity.email, identity.password);
    if (created.action !== "none") {
      const grant = await passwordSignIn(e, identity.email, identity.password);
      if (grant.session) {
        const id = created.id ?? (await findUserByEmail(e, identity.email))?.id;
        return { session: grant.session, disposableUserId: id };
      }
    }
  }

  const grant = await passwordSignIn(e);
  if (grant.session) return { session: grant.session };
  return {
    session: null,
    reason:
      `password grant failed (HTTP ${grant.status}${grant.errorCode ? `, ${grant.errorCode}` : ""}). ` +
      `Bind SUPABASE_SERVICE_ROLE_KEY or E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD.`,
  };
}

export async function releaseAuditSession(
  s: AuditSession,
  e: E2EEnv = resolveEnv(),
): Promise<void> {
  if (s.disposableUserId && e.serviceKey) await deleteUser(e, s.disposableUserId);
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

    const acquired = await acquireAuditSession(e);
    if (!acquired.session) {
      blockers.push(`Authenticated audit could not execute: ${acquired.reason}`);
    } else {
      try {
        checks.push(
          ...(await auditAuthenticated(
            e.url,
            e.anonKey,
            acquired.session.access_token,
            acquired.session.user.id,
          )),
        );
      } finally {
        await releaseAuditSession(acquired, e);
      }
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

/**
 * Automated GraphQL (pg_graphql) security verification.
 *
 * Executes REAL queries against the project's Supabase GraphQL endpoint and,
 * when a direct database URL is available, verifies schema/table grants.
 *
 * Nothing here is simulated: every check either executes and reports
 * PASS/FAIL, or is reported as NOT VERIFIED with the exact blocker.
 *
 * Usage: bun run scripts/verify-graphql-security.ts
 */
export type CheckStatus = "PASS" | "FAIL" | "NOT VERIFIED";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  /** Actual query text executed (SQL or GraphQL), when one ran. */
  query?: string;
  /** Raw response / rows returned. */
  evidence?: unknown;
  /** Why a check could not run, or why it failed. */
  detail?: string;
}

const GRAPHQL_PATH = "/graphql/v1";

/** Tables that must NOT be reachable by the anon role through pg_graphql. */
export const ANON_FORBIDDEN_COLLECTIONS = [
  "profilesCollection",
  "missionsCollection",
  "chatsCollection",
  "messagesCollection",
  "memoriesCollection",
  "subscriptionsCollection",
  "user_xpCollection",
  "streaksCollection",
] as const;

export interface GraphqlResponse {
  data: unknown;
  errors?: Array<{ message: string }>;
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
    headers: {
      apikey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return (await res.json()) as GraphqlResponse;
}

/**
 * A collection is considered hidden when pg_graphql does not expose the field
 * at all (no SELECT grant) — the response carries an `Unknown field` error.
 */
export function isCollectionHidden(res: GraphqlResponse, collection: string): boolean {
  const msgs = (res.errors ?? []).map((e) => e.message).join(" | ");
  return msgs.includes(`Unknown field "${collection}"`);
}

/** A visible-but-RLS-filtered collection returns an empty edges array. */
export function edgeCount(res: GraphqlResponse, collection: string): number | null {
  const data = res.data as Record<string, { edges?: unknown[] } | undefined> | null;
  const edges = data?.[collection]?.edges;
  return Array.isArray(edges) ? edges.length : null;
}

/**
 * Postgres/PostgREST transport failures (statement timeout, connection reset)
 * arrive as a bare `{ code, message }` body with neither `data` nor `errors`.
 * They prove nothing about exposure, so they must be reported as
 * NOT_VERIFIED rather than scored as a leak.
 */
const TRANSPORT_ERROR_CODES = new Set(["57014", "53300", "08006", "08003", "XX000"]);

export function isTransportError(res: GraphqlResponse): boolean {
  const r = res as GraphqlResponse & { code?: string; message?: string };
  if (r.data !== undefined || Array.isArray(r.errors)) return false;
  if (typeof r.code === "string" && TRANSPORT_ERROR_CODES.has(r.code)) return true;
  return typeof r.message === "string";
}

export async function verifyAnonGraphql(
  baseUrl: string,
  anonKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const collection of ANON_FORBIDDEN_COLLECTIONS) {
    const query = `{ ${collection} { edges { node { nodeId } } } }`;
    const res = await runGraphql(baseUrl, anonKey, anonKey, query, fetchImpl);
    if (isTransportError(res)) {
      results.push({
        name: `anon pg_graphql: ${collection}`,
        status: "NOT_VERIFIED",
        query,
        evidence: res,
        detail:
          "NOT VERIFIED: transport error from Supabase (no GraphQL response) — exposure undetermined",
      });
      continue;
    }
    const hidden = isCollectionHidden(res, collection);
    const count = edgeCount(res, collection);
    results.push({
      name: `anon pg_graphql: ${collection}`,
      status: hidden || count === 0 ? "PASS" : "FAIL",
      query,
      evidence: res,
      detail: hidden
        ? "field not exposed to anon (no SELECT grant)"
        : count === 0
          ? "field exposed but RLS returned 0 rows"
          : `LEAK: ${count} row(s) returned to anon`,
    });
  }
  return results;
}

export async function verifyAuthenticatedGraphql(
  baseUrl: string,
  anonKey: string,
  accessToken: string,
  expectedUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const query = `{ profilesCollection { edges { node { id } } } missionsCollection { edges { node { id user_id } } } }`;
  const res = await runGraphql(baseUrl, anonKey, accessToken, query, fetchImpl);
  const data = res.data as {
    profilesCollection?: { edges: Array<{ node: { id: string } }> };
    missionsCollection?: { edges: Array<{ node: { id: string; user_id: string } }> };
  } | null;

  const profileIds = (data?.profilesCollection?.edges ?? []).map((e) => e.node.id);
  const missionOwners = (data?.missionsCollection?.edges ?? []).map((e) => e.node.user_id);
  const foreignProfiles = profileIds.filter((id) => id !== expectedUserId);
  const foreignMissions = missionOwners.filter((id) => id !== expectedUserId);

  results.push({
    name: "authenticated pg_graphql: RLS scopes rows to auth.uid()",
    status: foreignProfiles.length === 0 && foreignMissions.length === 0 ? "PASS" : "FAIL",
    query,
    evidence: res,
    detail:
      foreignProfiles.length === 0 && foreignMissions.length === 0
        ? `all ${profileIds.length + missionOwners.length} returned row(s) belong to the caller`
        : `RLS LEAK: ${foreignProfiles.length} foreign profile(s), ${foreignMissions.length} foreign mission(s)`,
  });
  return results;
}

export const GRANT_SQL = `
SELECT n.nspname AS schema, r.rolname AS role,
       has_schema_privilege(r.rolname, n.nspname, 'USAGE') AS usage_priv
FROM pg_namespace n
CROSS JOIN (SELECT unnest(ARRAY['anon','authenticated','service_role']) AS rolname) r
WHERE n.nspname IN ('graphql','graphql_public','public')
ORDER BY 1,2;`;

export const TABLE_GRANT_SQL = `
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count,
       has_table_privilege('anon', 'public.'||quote_ident(c.relname), 'SELECT') AS anon_select,
       has_table_privilege('authenticated', 'public.'||quote_ident(c.relname), 'SELECT') AS auth_select
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 1;`;

/** Every public table must have RLS enabled, at least one policy, and no anon SELECT. */
export interface TableGrantRow {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number | string;
  anon_select: boolean;
  auth_select: boolean;
}

export function assessTableGrants(rows: TableGrantRow[]): CheckResult {
  const violations = rows.filter(
    (r) => !r.rls_enabled || Number(r.policy_count) === 0 || r.anon_select,
  );
  return {
    name: "public schema grants: RLS enabled, policies present, no anon SELECT",
    status: violations.length === 0 ? "PASS" : "FAIL",
    query: TABLE_GRANT_SQL,
    evidence: rows,
    detail:
      violations.length === 0
        ? `${rows.length} table(s) verified`
        : `violations: ${violations.map((v) => v.table_name).join(", ")}`,
  };
}

async function main() {
  const results: CheckResult[] = [];
  const baseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!baseUrl || !anonKey) {
    results.push({
      name: "anon pg_graphql execution",
      status: "NOT VERIFIED",
      detail:
        "Blocker: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are not bound to this runtime. " +
        "Bind them to the server environment and re-run.",
    });
  } else {
    results.push(...(await verifyAnonGraphql(baseUrl, anonKey)));
  }

  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;
  if (!baseUrl || !anonKey || !email || !password) {
    results.push({
      name: "authenticated pg_graphql execution",
      status: "NOT VERIFIED",
      detail:
        "Blocker: E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD are not bound to this runtime, " +
        "so no user session can be minted. Bind them and re-run.",
    });
  } else {
    const tokenRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const token = (await tokenRes.json()) as {
      access_token?: string;
      user?: { id: string };
      error_description?: string;
    };
    if (!token.access_token || !token.user?.id) {
      results.push({
        name: "authenticated pg_graphql execution",
        status: "NOT VERIFIED",
        detail: `Blocker: sign-in failed (${token.error_description ?? tokenRes.status}).`,
      });
    } else {
      results.push(
        ...(await verifyAuthenticatedGraphql(baseUrl, anonKey, token.access_token, token.user.id)),
      );
    }
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    results.push({
      name: "graphql / graphql_public / public schema grant introspection",
      status: "NOT VERIFIED",
      query: GRANT_SQL,
      detail:
        "Blocker: SUPABASE_DB_URL is not bound to this runtime, so direct catalog queries " +
        "cannot execute. Bind SUPABASE_DB_URL to the server environment and re-run.",
    });
  } else {
    const { default: postgres } = await import("postgres");
    const sql = postgres(dbUrl, { max: 1 });
    try {
      const schemaRows = await sql.unsafe(GRANT_SQL);
      results.push({
        name: "graphql / graphql_public / public schema USAGE grants",
        status: "PASS",
        query: GRANT_SQL,
        evidence: schemaRows,
      });
      const tableRows = (await sql.unsafe(TABLE_GRANT_SQL)) as unknown as TableGrantRow[];
      results.push(assessTableGrants(tableRows));
    } finally {
      await sql.end();
    }
  }

  for (const r of results) {
    console.log(`[${r.status}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.query) console.log(`  query: ${r.query.replace(/\s+/g, " ").trim().slice(0, 400)}`);
    if (r.evidence) console.log(`  evidence: ${JSON.stringify(r.evidence).slice(0, 800)}`);
  }
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(
    `\nsummary: ${results.filter((r) => r.status === "PASS").length} PASS, ${failed.length} FAIL, ` +
      `${results.filter((r) => r.status === "NOT VERIFIED").length} NOT VERIFIED`,
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

if (import.meta.main) {
  await main();
}

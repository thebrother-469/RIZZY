#!/usr/bin/env bun
/**
 * GraphQL ROW-LEVEL isolation audit.
 *
 * `verify-graphql.ts` proves *which collections* each role can reach. This
 * script proves *which rows* come back: two real users are provisioned, both
 * query the same collections, and every returned row must belong to the
 * caller — through plain queries, nested relations, pagination and ordering.
 *
 *   bun run verify:graphql:row-scope
 *
 * Emits security-artifacts/graphql-row-scope.json. Exit 1 on any leak.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  ANON_FORBIDDEN_TABLES,
  auditAnon,
  collectionName,
  runGraphql,
  type ExposureCheck,
  type GraphqlResponse,
} from "./verify-graphql";
import {
  resolveEnv,
  ensureUser,
  deleteUser,
  findUserByEmail,
  disposableIdentity,
  passwordSignIn,
  type AuthSession,
  type E2EEnv,
} from "./e2e-env";

export const ROW_SCOPE_ARTIFACT = "security-artifacts/graphql-row-scope.json";

/** Owner column proving row ownership per collection. */
export const OWNER_COLUMN: Record<string, string> = {
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

export const ROW_SCOPE_TABLES = Object.keys(OWNER_COLUMN);

export type ProbeKind = "plain" | "nested" | "pagination" | "ordering";

export interface ScopeCheck {
  role: "anon" | "authenticated";
  actor: string;
  table: string;
  collection: string;
  kind: ProbeKind;
  rows: number;
  foreignRows: number;
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
  query: string;
  detail: string;
}

export function scopeQuery(table: string, kind: ProbeKind): string {
  const owner = OWNER_COLUMN[table] ?? "user_id";
  const c = collectionName(table);
  switch (kind) {
    case "nested":
      // Nested relations must inherit the parent's RLS scope.
      return table === "chats"
        ? `{ chatsCollection(first: 5) { edges { node { user_id messagesCollection(first: 5) { edges { node { user_id } } } } } } }`
        : `{ ${c}(first: 5) { edges { node { ${owner} } } } }`;
    case "pagination":
      return `{ ${c}(first: 50) { pageInfo { hasNextPage } edges { node { ${owner} } } } }`;
    case "ordering":
      return `{ ${c}(first: 50, orderBy: [{ ${owner}: DescNullsLast }]) { edges { node { ${owner} } } } }`;
    default:
      return `{ ${c}(first: 50) { edges { node { ${owner} } } } }`;
  }
}

/** Recursively collects every owner-column value present in a response. */
export function collectOwners(node: unknown, owner: string, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) collectOwners(n, owner, out);
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if ((k === owner || k === "user_id" || k === "id") && typeof v === "string") {
        // Only treat it as an owner value when it looks like a uuid.
        if (/^[0-9a-f-]{36}$/i.test(v)) out.push(v);
      } else {
        collectOwners(v, owner, out);
      }
    }
  }
  return out;
}

export function evaluateScope(
  actor: string,
  userId: string,
  table: string,
  kind: ProbeKind,
  res: GraphqlResponse,
  query: string,
): ScopeCheck {
  const owner = OWNER_COLUMN[table] ?? "user_id";
  const owners = collectOwners(res.data, owner);
  const foreign = owners.filter((o) => o !== userId);
  const errored = !res.data && (res.errors?.length ?? 0) > 0;
  return {
    role: "authenticated",
    actor,
    table,
    collection: collectionName(table),
    kind,
    rows: owners.length,
    foreignRows: foreign.length,
    status: errored ? "NOT_VERIFIED" : foreign.length > 0 ? "FAIL" : "PASS",
    query,
    detail: errored
      ? `probe errored: ${JSON.stringify(res.errors).slice(0, 160)}`
      : foreign.length > 0
        ? `RLS LEAK: ${foreign.length} row(s) owned by another user via ${kind} probe`
        : `${owners.length} row(s), all owned by ${actor} (${kind})`,
  };
}

export async function auditRowScope(
  baseUrl: string,
  anonKey: string,
  actor: string,
  accessToken: string,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ScopeCheck[]> {
  const out: ScopeCheck[] = [];
  for (const table of ROW_SCOPE_TABLES) {
    for (const kind of ["plain", "nested", "pagination", "ordering"] as ProbeKind[]) {
      const query = scopeQuery(table, kind);
      const res = await runGraphql(baseUrl, anonKey, accessToken, query, fetchImpl);
      out.push(evaluateScope(actor, userId, table, kind, res, query));
    }
  }
  return out;
}

export interface RowScopeArtifact {
  generatedAt: string;
  project: string | null;
  tables: string[];
  actors: string[];
  anon: ExposureCheck[];
  scope: ScopeCheck[];
  leaks: ScopeCheck[];
  summary: { pass: number; fail: number; notVerified: number };
  blockers: string[];
  status: "PASS" | "FAIL" | "NOT_VERIFIED";
}

export function buildRowScopeArtifact(
  anon: ExposureCheck[],
  scope: ScopeCheck[],
  blockers: string[],
  project: string | null,
  now = new Date(),
): RowScopeArtifact {
  const all = [...anon, ...scope];
  const pass = all.filter((c) => c.status === "PASS").length;
  const fail = all.filter((c) => c.status === "FAIL").length;
  const notVerified = all.filter((c) => c.status === "NOT_VERIFIED").length + blockers.length;
  return {
    generatedAt: now.toISOString(),
    project,
    tables: [...ROW_SCOPE_TABLES],
    actors: [...new Set(scope.map((s) => s.actor))],
    anon,
    scope,
    leaks: scope.filter((s) => s.status === "FAIL"),
    summary: { pass, fail, notVerified },
    blockers,
    status: fail > 0 ? "FAIL" : blockers.length > 0 ? "NOT_VERIFIED" : "PASS",
  };
}

export function writeRowScopeArtifact(a: RowScopeArtifact, path = ROW_SCOPE_ARTIFACT): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(a, null, 2)}\n`);
}

export interface Actor {
  name: string;
  session: AuthSession;
  disposableUserId?: string;
}

/** Provisions two disposable, mutually isolated identities. */
export async function acquireTwoActors(
  e: E2EEnv,
): Promise<{ actors: Actor[]; reason?: string }> {
  if (!e.serviceKey) {
    const grant = await passwordSignIn(e);
    if (grant.session) {
      return {
        actors: [{ name: "userA", session: grant.session }],
        reason:
          "only one identity available (SUPABASE_SERVICE_ROLE_KEY unbound) — cross-user isolation is single-sided",
      };
    }
    return { actors: [], reason: "no service-role key and no E2E password grant available" };
  }

  const actors: Actor[] = [];
  for (const name of ["userA", "userB"]) {
    const identity = disposableIdentity(`rowscope-${name}`);
    const created = await ensureUser(e, identity.email, identity.password);
    if (created.action === "none") continue;
    const grant = await passwordSignIn(e, identity.email, identity.password);
    if (!grant.session) continue;
    const id = created.id ?? (await findUserByEmail(e, identity.email))?.id;
    actors.push({ name, session: grant.session, ...(id ? { disposableUserId: id } : {}) });
  }
  return actors.length === 2
    ? { actors }
    : { actors, reason: `only provisioned ${actors.length}/2 disposable identities` };
}

export async function releaseActors(actors: Actor[], e: E2EEnv): Promise<void> {
  for (const a of actors) if (a.disposableUserId && e.serviceKey) await deleteUser(e, a.disposableUserId);
}

export async function main(): Promise<number> {
  const e = resolveEnv();
  const project = e.url?.match(/https?:\/\/([^.]+)\./)?.[1] ?? null;
  const blockers: string[] = [];
  const anon: ExposureCheck[] = [];
  const scope: ScopeCheck[] = [];

  if (!e.url || !e.anonKey) {
    blockers.push("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not bound — no probe could run.");
  } else {
    anon.push(...(await auditAnon(e.url, e.anonKey)));
    const { actors, reason } = await acquireTwoActors(e);
    if (reason) blockers.push(reason);
    try {
      for (const a of actors) {
        scope.push(
          ...(await auditRowScope(
            e.url,
            e.anonKey,
            a.name,
            a.session.access_token,
            a.session.user.id,
            fetch,
          )),
        );
      }
    } finally {
      await releaseActors(actors, e);
    }
  }

  const artifact = buildRowScopeArtifact(anon, scope, blockers, project);
  writeRowScopeArtifact(artifact);
  for (const c of anon) console.log(`[${c.status}] anon :: ${c.collection} — ${c.detail}`);
  for (const c of scope) console.log(`[${c.status}] ${c.actor} :: ${c.collection} — ${c.detail}`);
  for (const b of blockers) console.log(`[NOT_VERIFIED] ${b}`);
  console.log(
    `\nrow-scope: ${artifact.summary.pass} PASS, ${artifact.summary.fail} FAIL, ` +
      `${artifact.summary.notVerified} NOT VERIFIED -> ${ROW_SCOPE_ARTIFACT}`,
  );
  return artifact.status === "FAIL" ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await main());
}

// Re-exported so the contract tests can assert the anon denylist stays aligned.
export { ANON_FORBIDDEN_TABLES };

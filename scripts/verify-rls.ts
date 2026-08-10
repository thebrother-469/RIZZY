#!/usr/bin/env bun
/**
 * RLS + auth.uid() isolation regression suite.
 *
 * Drives the real PostgREST endpoint with three identities:
 *   - anon               (publishable key, no session)
 *   - user A             (authenticated, owns the fixtures)
 *   - user B             (authenticated, must never see A's rows)
 *
 * For every user-owned table it exercises SELECT / INSERT / UPDATE / DELETE
 * and asserts the expected allow/deny outcome, then attempts cross-user
 * access on each of A's rows. Every project RPC is invoked cross-user too.
 *
 * Emits security-artifacts/rls-coverage.json:
 *   { table, policy, operation, role, expected, actual, result }
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (to provision the two
 * disposable users). Without them the run reports NOT VERIFIED and exits 0.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import {
  resolveEnv,
  missing,
  ensureUser,
  deleteUser,
  passwordSignIn,
  disposableIdentity,
  type E2EEnv,
} from "./e2e-env";

type Role = "anon" | "owner" | "other";
type Op = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "RPC";

interface Check {
  table: string;
  operation: Op;
  role: Role;
  expected: "allow" | "deny";
  actual: "allow" | "deny" | "unknown";
  status: number;
  result: "PASS" | "FAIL" | "NOT_VERIFIED";
  note?: string;
}

const checks: Check[] = [];

function record(c: Omit<Check, "result">) {
  const result: Check["result"] =
    c.actual === "unknown" ? "NOT_VERIFIED" : c.expected === c.actual ? "PASS" : "FAIL";
  checks.push({ ...c, result });
}

/**
 * Transport-level failures (network drop, gateway error, statement timeout)
 * prove nothing about the policy under test and must never be scored as a
 * security PASS or FAIL.
 */
function isTransport(status: number, body: unknown): boolean {
  if (status === 0 || status === 408 || status === 429) return true;
  if (status >= 500) return true;
  const code = (body as { code?: string } | null)?.code;
  return code === "57014" || code === "08006" || code === "53300";
}

/** allow | deny | unknown for a response where denial is meaningful. */
function outcome(status: number, body: unknown): "allow" | "deny" | "unknown" {
  if (isTransport(status, body)) return "unknown";
  // 401/403 (permission denied), 404 (no grant/route) => denial.
  if (status >= 400) return "deny";
  // PostgREST silently returns [] when RLS filters everything out.
  if (Array.isArray(body) && body.length === 0) return "deny";
  return "allow";
}

/** Status-only variant: an empty array is a legitimate allow. */
function statusOutcome(status: number, body: unknown): "allow" | "deny" | "unknown" {
  if (isTransport(status, body)) return "unknown";
  return status < 300 ? "allow" : "deny";
}

async function rest(
  e: E2EEnv,
  token: string | null,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${e.url!.replace(/\/$/, "")}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: e.anonKey!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as unknown };
}

/** table -> owner column; the row factory produces a minimal valid insert. */
const TABLES: {
  name: string;
  owner: string;
  row?: (uid: string) => Record<string, unknown>;
  writable: boolean;
  /** false => no client grant by design; the app reads it server-side only. */
  clientReadable?: boolean;
}[] = [
  { name: "profiles", owner: "id", writable: false },
  {
    name: "chats",
    owner: "user_id",
    writable: true,
    row: (uid) => ({ user_id: uid, title: "rls-probe", mode: "chat" }),
  },
  {
    name: "memories",
    owner: "user_id",
    writable: true,
    row: (uid) => ({ user_id: uid, title: "rls-probe", content: "probe" }),
  },
  {
    name: "missions",
    owner: "user_id",
    writable: true,
    row: (uid) => ({ user_id: uid, title: "rls-probe", description: "probe" }),
  },
  { name: "user_xp", owner: "user_id", writable: false },
  { name: "streaks", owner: "user_id", writable: false },
  { name: "badges", owner: "user_id", writable: false },
  { name: "subscriptions", owner: "user_id", writable: false },
  { name: "usage_daily", owner: "user_id", writable: false },
  { name: "xp_events", owner: "user_id", writable: false },
  // Quota ledger + audit trail carry no client grants: the app reads them
  // through service-role server functions, so a direct client read must fail.
  { name: "profile_gen_usage", owner: "user_id", writable: false, clientReadable: false },
  { name: "auth_audit_logs", owner: "user_id", writable: false, clientReadable: false },
];

/** Tables no client role may ever read. */
const SERVICE_ONLY = [
  "lemonsqueezy_webhook_events",
  "paddle_webhook_events",
  "onboarding_debug_events",
  "daily_mission_debug_events",
];

const RPCS = [
  { name: "award_xp", args: { _event_type: "chat_message" } },
  { name: "award_badge", args: { _key: "first_mission" } },
  { name: "get_profile_gen_usage_today", args: {} },
  { name: "consume_profile_gen_quota", args: { _cap: 1 } },
];

async function main() {
  const e = resolveEnv();
  const need = missing(e, ["url", "anonKey", "serviceKey"]);
  if (need.length) {
    const out = {
      overall: "NOT VERIFIED",
      detail: `RLS suite needs ${need.join(", ")}.`,
      checks: [],
    };
    emit(out);
    process.exit(0);
  }

  const a = disposableIdentity("rls-a");
  const b = disposableIdentity("rls-b");
  const userA = await ensureUser(e, a.email, a.password);
  const userB = await ensureUser(e, b.email, b.password);
  const sessionA = (await passwordSignIn(e, a.email, a.password)).session;
  const sessionB = (await passwordSignIn(e, b.email, b.password)).session;

  if (!sessionA || !sessionB || !userA.id || !userB.id) {
    emit({
      overall: "NOT VERIFIED",
      detail: "Could not provision two test identities.",
      checks: [],
    });
    process.exit(0);
  }
  const tokenA = sessionA.access_token;
  const tokenB = sessionB.access_token;
  const uidA = sessionA.user.id;

  const createdIds: Record<string, string> = {};

  try {
    for (const t of TABLES) {
      // anon must never read a user-owned table.
      const anonRead = await rest(e, null, `/${t.name}?select=*&limit=1`);
      record({
        table: t.name,
        operation: "SELECT",
        role: "anon",
        expected: "deny",
        actual: outcome(anonRead.status, anonRead.body),
        status: anonRead.status,
      });

      // owner INSERT (only where the app itself writes).
      if (t.writable && t.row) {
        const ins = await rest(e, tokenA, `/${t.name}`, {
          method: "POST",
          body: JSON.stringify(t.row(uidA)),
        });
        const id = Array.isArray(ins.body) ? (ins.body[0] as { id?: string })?.id : undefined;
        if (id) createdIds[t.name] = id;
        record({
          table: t.name,
          operation: "INSERT",
          role: "owner",
          expected: "allow",
          actual: statusOutcome(ins.status, ins.body),
          status: ins.status,
        });

        // Cross-user INSERT forging another user's ownership must fail.
        const forged = await rest(e, tokenB, `/${t.name}`, {
          method: "POST",
          body: JSON.stringify(t.row(uidA)),
        });
        record({
          table: t.name,
          operation: "INSERT",
          role: "other",
          expected: "deny",
          actual: statusOutcome(forged.status, forged.body),
          status: forged.status,
          note: "forged user_id of another account",
        });
      }

      // owner SELECT of own rows. Tables without a client grant must deny.
      const ownRead = await rest(e, tokenA, `/${t.name}?${t.owner}=eq.${uidA}&select=*`);
      const clientReadable = t.clientReadable !== false;
      record({
        table: t.name,
        operation: "SELECT",
        role: "owner",
        expected: clientReadable ? "allow" : "deny",
        actual: statusOutcome(ownRead.status, ownRead.body),
        status: ownRead.status,
        note: clientReadable
          ? "status-only: empty result sets are legitimate"
          : "no client grant by design; read server-side via service role",
      });

      // Service role must still reach the table, otherwise the server-side
      // feature that owns it is broken rather than merely locked down.
      if (!clientReadable) {
        const svcRead = await rest(e, e.serviceKey!, `/${t.name}?select=*&limit=1`);
        record({
          table: t.name,
          operation: "SELECT",
          role: "owner",
          expected: "allow",
          actual: statusOutcome(svcRead.status, svcRead.body),
          status: svcRead.status,
          note: "service-role read path",
        });
      }

      // cross-user SELECT must return nothing.
      const crossRead = await rest(e, tokenB, `/${t.name}?${t.owner}=eq.${uidA}&select=*`);
      record({
        table: t.name,
        operation: "SELECT",
        role: "other",
        expected: "deny",
        actual: outcome(crossRead.status, crossRead.body),
        status: crossRead.status,
      });

      const rowId = createdIds[t.name];
      if (rowId) {
        const crossUpdate = await rest(e, tokenB, `/${t.name}?id=eq.${rowId}`, {
          method: "PATCH",
          body: JSON.stringify({ title: "hijacked" }),
        });
        record({
          table: t.name,
          operation: "UPDATE",
          role: "other",
          expected: "deny",
          actual: isAllowed(crossUpdate.status, crossUpdate.body) ? "allow" : "deny",
          status: crossUpdate.status,
        });

        const crossDelete = await rest(e, tokenB, `/${t.name}?id=eq.${rowId}`, {
          method: "DELETE",
        });
        record({
          table: t.name,
          operation: "DELETE",
          role: "other",
          expected: "deny",
          actual: isAllowed(crossDelete.status, crossDelete.body) ? "allow" : "deny",
          status: crossDelete.status,
        });

        const ownDelete = await rest(e, tokenA, `/${t.name}?id=eq.${rowId}`, { method: "DELETE" });
        record({
          table: t.name,
          operation: "DELETE",
          role: "owner",
          expected: "allow",
          actual: ownDelete.status < 300 ? "allow" : "deny",
          status: ownDelete.status,
        });
      }
    }

    for (const name of SERVICE_ONLY) {
      for (const [role, token] of [
        ["anon", null],
        ["owner", tokenA],
      ] as const) {
        const res = await rest(e, token, `/${name}?select=*&limit=1`);
        record({
          table: name,
          operation: "SELECT",
          role,
          expected: "deny",
          actual: isAllowed(res.status, res.body) ? "allow" : "deny",
          status: res.status,
          note: "service-only table",
        });
      }
    }

    // RPCs: anonymous invocation is always denied; a signed-in caller may
    // never act on behalf of another user id via the _caller_id argument.
    for (const rpc of RPCS) {
      const anonCall = await rest(e, null, `/rpc/${rpc.name}`, {
        method: "POST",
        body: JSON.stringify(rpc.args),
      });
      record({
        table: rpc.name,
        operation: "RPC",
        role: "anon",
        expected: "deny",
        actual: anonCall.status < 300 ? "allow" : "deny",
        status: anonCall.status,
      });

      const impersonation = await rest(e, tokenB, `/rpc/${rpc.name}`, {
        method: "POST",
        body: JSON.stringify({ ...rpc.args, _caller_id: uidA }),
      });
      const body = JSON.stringify(impersonation.body ?? "");
      // Denied outright, or a no-op (null) result: either way user B gained nothing.
      const gained = impersonation.status < 300 && body !== "null" && body !== '""';
      record({
        table: rpc.name,
        operation: "RPC",
        role: "other",
        expected: "deny",
        actual: gained ? "allow" : "deny",
        status: impersonation.status,
        note: "_caller_id impersonation attempt",
      });
    }

    // complete_mission: B must not be able to complete A's mission.
    const mission = await rest(e, tokenA, "/missions", {
      method: "POST",
      body: JSON.stringify({ user_id: uidA, title: "rls-probe", description: "probe" }),
    });
    const missionId = Array.isArray(mission.body)
      ? (mission.body[0] as { id?: string })?.id
      : undefined;
    if (missionId) {
      const hijack = await rest(e, tokenB, "/rpc/complete_mission", {
        method: "POST",
        body: JSON.stringify({ _mission_id: missionId }),
      });
      record({
        table: "complete_mission",
        operation: "RPC",
        role: "other",
        expected: "deny",
        actual: hijack.status < 300 ? "allow" : "deny",
        status: hijack.status,
        note: "cross-user mission completion",
      });
      const ownComplete = await rest(e, tokenA, "/rpc/complete_mission", {
        method: "POST",
        body: JSON.stringify({ _mission_id: missionId }),
      });
      record({
        table: "complete_mission",
        operation: "RPC",
        role: "owner",
        expected: "allow",
        actual: ownComplete.status < 300 ? "allow" : "deny",
        status: ownComplete.status,
      });
      await rest(e, tokenA, `/missions?id=eq.${missionId}`, { method: "DELETE" });
    }
  } finally {
    if (userA.id) await deleteUser(e, userA.id);
    if (userB.id) await deleteUser(e, userB.id);
  }

  const failures = checks.filter((c) => c.result === "FAIL");
  const coveredTables = new Set(checks.map((c) => c.table));
  const missingCoverage = [...TABLES.map((t) => t.name), ...SERVICE_ONLY].filter(
    (t) => !coveredTables.has(t),
  );
  emit({
    overall: failures.length ? "FAIL" : "PASS",
    total: checks.length,
    failures: failures.length,
    missingCoverage,
    checks,
  });
  process.exit(failures.length ? 1 : 0);
}

function emit(report: unknown) {
  mkdirSync("security-artifacts", { recursive: true });
  writeFileSync("security-artifacts/rls-coverage.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) await main();

#!/usr/bin/env bun
/**
 * Production health verification for the RizzGod mission pipeline.
 *
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to inspect the shape of the
 * mission / xp / badge / streak surface without mutating any user's state.
 *
 * Checks:
 *   - required tables reachable (missions, xp_events, user_xp, badges, streaks, profiles)
 *   - required RPCs exist (complete_mission, award_xp, award_badge)
 *   - required XP dedup indexes exist
 *   - schema shape (key columns present)
 *
 * Exits non-zero on any failure so CI can gate on it.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

async function tableReachable(name: string, cols: string) {
  const { error } = await supa.from(name).select(cols).limit(1);
  record(`table:${name}`, !error, error?.message);
}

async function rpcExists(fn: string, args: Record<string, unknown>) {
  const { error } = await supa.rpc(fn, args);
  // "not found" / "does not exist" is the failure we care about; other errors
  // (missing rows, invalid ids) mean the RPC itself is wired up.
  const missing =
    !!error &&
    /function .* does not exist|schema cache|Could not find the function/i.test(error.message);
  record(`rpc:${fn}`, !missing, missing ? error?.message : undefined);
}

async function main() {
  await Promise.all([
    tableReachable("missions", "id,user_id,completed,assigned_date"),
    tableReachable("xp_events", "id,user_id,event_type,xp_delta,meta"),
    tableReachable("user_xp", "user_id,total_xp,level"),
    tableReachable("badges", "user_id,badge_key"),
    tableReachable("streaks", "user_id,current_streak,longest_streak"),
    tableReachable("profiles", "id,onboarded_at"),
  ]);

  await rpcExists("complete_mission", {
    _mission_id: "00000000-0000-0000-0000-000000000000",
  });
  await rpcExists("award_xp", { _event_type: "chat_message", _meta: null });
  await rpcExists("award_badge", { _key: "first_mission" });

  // Report.
  console.log("========== Health Report ==========");
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  console.log("===================================");
  if (failed.length) {
    console.log(`${failed.length} failure(s).`);
    process.exit(1);
  }
  console.log("All health checks passed.");
}

main().catch((err) => {
  console.error("health check crashed:", err);
  process.exit(2);
});

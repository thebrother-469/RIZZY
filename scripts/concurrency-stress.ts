#!/usr/bin/env bun
/**
 * Concurrency stress test for complete_mission.
 *
 * Fires N parallel calls against the RPC for a single mission and asserts:
 *   - RPC responds successfully every time (no crashes / deadlocks)
 *   - exactly ONE call reports updated=true
 *   - exactly ONE xp_events row exists for (user, mission_id)
 *   - user_xp.total_xp increased by exactly the expected delta (50 or 60
 *     with a fresh streak day)
 *
 * Requires (all set in CI / local env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STRESS_USER_ID      — a real auth user with a profile row
 *   STRESS_MISSION_ID   — an existing mission for that user (completed=false)
 *
 * Read-only apart from the mission it targets (which it completes once).
 * The DB row lock in complete_mission serializes all concurrent callers.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uid = process.env.STRESS_USER_ID;
const mid = process.env.STRESS_MISSION_ID;
const N = Number(process.env.STRESS_PARALLEL ?? 25);

if (!url || !key || !uid || !mid) {
  console.error(
    "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRESS_USER_ID, STRESS_MISSION_ID",
  );
  process.exit(2);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: before, error: beforeErr } = await supa
    .from("user_xp")
    .select("total_xp")
    .eq("user_id", uid!)
    .maybeSingle();
  if (beforeErr) throw beforeErr;
  const totalBefore = before?.total_xp ?? 0;

  console.log(`Firing ${N} parallel complete_mission calls for mission=${mid}…`);
  const calls = Array.from({ length: N }, () =>
    supa.rpc("complete_mission", { _mission_id: mid!, _caller_id: uid! }),
  );
  const results = await Promise.all(calls);

  let updatedCount = 0;
  let errors = 0;
  for (const r of results) {
    if (r.error) {
      errors++;
      console.error("  rpc error:", r.error.message);
      continue;
    }
    const row = r.data as { updated: boolean } | null;
    if (row?.updated) updatedCount++;
  }

  const { data: events } = await supa
    .from("xp_events")
    .select("id")
    .eq("user_id", uid!)
    .eq("event_type", "mission_completed")
    .filter("meta->>mission_id", "eq", mid!);

  const { data: after } = await supa
    .from("user_xp")
    .select("total_xp")
    .eq("user_id", uid!)
    .maybeSingle();
  const totalAfter = after?.total_xp ?? 0;

  console.log("");
  console.log("========== Concurrency Result ==========");
  console.log(`parallel calls:       ${N}`);
  console.log(`rpc errors:           ${errors}`);
  console.log(`updated=true count:   ${updatedCount}    (expected: 1)`);
  console.log(`xp_events rows:       ${events?.length ?? 0}    (expected: 1)`);
  console.log(`total_xp delta:       ${totalAfter - totalBefore}    (expected: 50 or 60)`);
  console.log("========================================");

  const ok =
    errors === 0 &&
    updatedCount === 1 &&
    (events?.length ?? 0) === 1 &&
    [50, 60].includes(totalAfter - totalBefore);
  if (!ok) {
    console.error("✗ Concurrency invariants violated.");
    process.exit(1);
  }
  console.log("✓ Exactly-once semantics upheld under concurrency.");
}

main().catch((err) => {
  console.error("stress test crashed:", err);
  process.exit(2);
});

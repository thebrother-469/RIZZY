#!/usr/bin/env bun
/**
 * Read-only XP + mission + badge integrity audit.
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env (service role
 * key is required so we can bypass RLS to scan all users). NEVER writes.
 *
 * Exits non-zero when any violation is detected so it can gate CI.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const supa = createClient(url, key, { auth: { persistSession: false } });

type Violation = { kind: string; detail: string };
const violations: Violation[] = [];
const record = (kind: string, detail: string) => violations.push({ kind, detail });

async function fetchAll<T>(table: string, cols: string): Promise<T[]> {
  const rows: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from(table)
      .select(cols)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  console.log("→ Auditing xp_events…");
  const events = await fetchAll<{
    id: string;
    user_id: string;
    event_type: string;
    xp_delta: number;
    meta: Record<string, unknown> | null;
    created_at: string;
  }>("xp_events", "id,user_id,event_type,xp_delta,meta,created_at");

  // Duplicate onboarding_complete per user.
  const onboardByUser = new Map<string, number>();
  for (const e of events) {
    if (e.event_type === "onboarding_complete") {
      onboardByUser.set(e.user_id, (onboardByUser.get(e.user_id) ?? 0) + 1);
    }
  }
  for (const [uid, n] of onboardByUser) {
    if (n > 1) record("dup_onboarding_complete", `user=${uid} count=${n}`);
  }

  // Duplicate mission_completed per (user, mission_id).
  const missionKey = new Map<string, number>();
  for (const e of events) {
    if (e.event_type !== "mission_completed") continue;
    const mid = (e.meta as { mission_id?: string } | null)?.mission_id;
    if (!mid) {
      record("mission_event_missing_id", `event=${e.id} user=${e.user_id}`);
      continue;
    }
    const k = `${e.user_id}:${mid}`;
    missionKey.set(k, (missionKey.get(k) ?? 0) + 1);
  }
  for (const [k, n] of missionKey) {
    if (n > 1) record("dup_mission_completed", `${k} count=${n}`);
  }

  // Negative XP.
  for (const e of events) {
    if (e.xp_delta < 0) record("negative_xp_event", `id=${e.id} delta=${e.xp_delta}`);
  }

  console.log("→ Auditing missions vs xp_events…");
  const missions = await fetchAll<{
    id: string;
    user_id: string;
    completed: boolean;
    completed_at: string | null;
  }>("missions", "id,user_id,completed,completed_at");

  const completedMissionIds = new Set(
    missions.filter((m) => m.completed).map((m) => `${m.user_id}:${m.id}`),
  );
  const mcEventKeys = new Set(Array.from(missionKey.keys()));

  // Completed missions without XP event.
  for (const key of completedMissionIds) {
    if (!mcEventKeys.has(key)) record("mission_without_xp", key);
  }
  // XP events referencing missions that aren't completed / don't exist.
  const validMissionIds = new Set(missions.map((m) => m.id));
  for (const k of mcEventKeys) {
    const [, mid] = k.split(":");
    if (!validMissionIds.has(mid)) record("xp_event_orphan_mission", k);
  }

  console.log("→ Auditing user_xp totals…");
  const xpRows = await fetchAll<{ user_id: string; total_xp: number; level: number }>(
    "user_xp",
    "user_id,total_xp,level",
  );
  const summed = new Map<string, number>();
  for (const e of events) summed.set(e.user_id, (summed.get(e.user_id) ?? 0) + e.xp_delta);
  for (const r of xpRows) {
    if (r.total_xp < 0) record("negative_total_xp", `user=${r.user_id} total=${r.total_xp}`);
    const s = summed.get(r.user_id) ?? 0;
    if (s !== r.total_xp)
      record("user_xp_total_mismatch", `user=${r.user_id} events_sum=${s} stored=${r.total_xp}`);
  }

  console.log("→ Auditing badges…");
  const badges = await fetchAll<{ user_id: string; badge_key: string }>(
    "badges",
    "user_id,badge_key",
  );
  const badgeSeen = new Map<string, number>();
  for (const b of badges) {
    const k = `${b.user_id}:${b.badge_key}`;
    badgeSeen.set(k, (badgeSeen.get(k) ?? 0) + 1);
  }
  for (const [k, n] of badgeSeen) {
    if (n > 1) record("dup_badge", `${k} count=${n}`);
  }

  console.log("→ Auditing streaks…");
  const streaks = await fetchAll<{
    user_id: string;
    current_streak: number;
    longest_streak: number;
  }>("streaks", "user_id,current_streak,longest_streak");
  for (const s of streaks) {
    if (s.current_streak < 0 || s.longest_streak < 0)
      record("negative_streak", `user=${s.user_id}`);
    if (s.current_streak > s.longest_streak)
      record(
        "streak_invariant_violated",
        `user=${s.user_id} current=${s.current_streak} longest=${s.longest_streak}`,
      );
  }

  // Report.
  console.log("");
  console.log("========== XP Integrity Report ==========");
  console.log(`xp_events:  ${events.length}`);
  console.log(`missions:   ${missions.length}`);
  console.log(`user_xp:    ${xpRows.length}`);
  console.log(`badges:     ${badges.length}`);
  console.log(`streaks:    ${streaks.length}`);
  console.log(`violations: ${violations.length}`);
  console.log("=========================================");
  if (violations.length) {
    const byKind = new Map<string, Violation[]>();
    for (const v of violations) {
      byKind.set(v.kind, [...(byKind.get(v.kind) ?? []), v]);
    }
    for (const [kind, list] of byKind) {
      console.log(`\n[${kind}] × ${list.length}`);
      for (const v of list.slice(0, 20)) console.log(`  - ${v.detail}`);
      if (list.length > 20) console.log(`  … (${list.length - 20} more)`);
    }
    process.exit(1);
  }
  console.log("\n✓ No violations detected.");
}

main().catch((err) => {
  console.error("audit crashed:", err);
  process.exit(2);
});

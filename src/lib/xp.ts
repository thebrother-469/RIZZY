import { supabase } from "@/integrations/supabase/client";

// Level curve: level N requires 100 * N XP into that level. Total XP for level N = 100 * N * (N-1) / 2.
export function levelFromXP(totalXP: number): { level: number; into: number; needed: number } {
  let level = 1;
  let cumulative = 0;
  while (true) {
    const needed = 100 * level;
    if (cumulative + needed > totalXP) {
      return { level, into: totalXP - cumulative, needed };
    }
    cumulative += needed;
    level += 1;
    if (level > 500) return { level, into: 0, needed: 100 * level };
  }
}

export const XP_REWARDS = {
  mission_completed: 50,
  streak_day: 10,
  chat_message: 2,
  roast_completed: 15,
  roleplay_session: 20,
  memory_created: 5,
  onboarding_complete: 100,
} as const;
export type XPEventType = keyof typeof XP_REWARDS;

// Client-side XP awarding is a no-op. XP is granted server-side as a side
// effect of authoritative actions (see completeMissionFn / completeOnboardingFn).
export async function awardXP(_eventType: XPEventType, _meta?: Record<string, unknown>) {
  return null;
}

export async function getUserXP() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_xp")
    .select("total_xp, level, xp_into_level")
    .eq("user_id", user.id)
    .maybeSingle();
  const total = data?.total_xp ?? 0;
  const info = levelFromXP(total);
  return {
    total_xp: total,
    level: data?.level ?? info.level,
    xp_into_level: data?.xp_into_level ?? info.into,
    xp_needed: info.needed,
  };
}

export const BADGES: Record<string, { label: string; description: string; emoji: string }> = {
  first_mission: { label: "First Blood", description: "Crushed your first mission", emoji: "🩸" },
  streak_3: { label: "On Fire", description: "3-day streak", emoji: "🔥" },
  streak_7: { label: "Iron Will", description: "7-day streak", emoji: "⚔️" },
  streak_30: { label: "Ascendant", description: "30-day streak", emoji: "👑" },
  level_5: { label: "Sharpshooter", description: "Reached level 5", emoji: "🎯" },
  level_10: { label: "Alpha", description: "Reached level 10", emoji: "🦁" },
  first_roast: { label: "Roasted", description: "Roasted your first DM", emoji: "🌶️" },
  memory_master: { label: "Memory Master", description: "10+ pinned memories", emoji: "🧠" },
};

// Client-side badge awarding is a no-op. Badges are granted server-side.
export async function awardBadge(_key: keyof typeof BADGES) {
  return null;
}

export async function getBadges() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("badges")
    .select("badge_key, earned_at")
    .eq("user_id", user.id)
    .order("earned_at", { ascending: false });
  return data ?? [];
}

export async function recentXPEvents(limit = 20) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("xp_events")
    .select("id, event_type, xp_delta, meta, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export function eventLabel(type: string) {
  const map: Record<string, string> = {
    mission_completed: "Mission crushed",
    streak_day: "Streak day",
    chat_message: "Coaching rep",
    roast_completed: "DM roasted",
    roleplay_session: "Roleplay done",
    memory_created: "Memory saved",
    onboarding_complete: "Onboarded",
  };
  return map[type] ?? type;
}

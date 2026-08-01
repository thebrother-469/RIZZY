/**
 * Dashboard data loader.
 *
 * Lives outside the route component so the fetch logic (which reads impure
 * sources like `Date.now()`) is never analysed as render-phase code, and so
 * the dashboard can be driven declaratively by TanStack Query instead of a
 * fetch-in-effect that cascades renders.
 */
import { supabase } from "@/integrations/supabase/client";
import { getUserXP, getBadges, recentXPEvents } from "@/lib/xp";
import { memoryStats } from "@/lib/memory";

export type DashboardMission = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  completed: boolean;
  assigned_date?: string;
  category?: string | null;
  estimated_time?: string | null;
  why_this_matters?: string | null;
  completion_action?: string | null;
  coach_tip?: string | null;
  persisted?: boolean;
} | null;

export type DashboardSnapshot = {
  streak: { current: number; longest: number };
  usage: number;
  recentChats: { id: string; title: string | null; mode: string; updated_at: string }[];
  xp: { total_xp: number; level: number; xp_into_level: number; xp_needed: number } | null;
  badges: { badge_key: string; earned_at: string }[];
  events: { id: string; xp_delta: number; event_type: string; created_at: string }[];
  weekly: number[];
  totals: { chats: number; messages: number; missions: number; memories: number };
  mission: DashboardMission;
};

export async function loadDashboard(userId: string): Promise<DashboardSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 6 * 86400_000).toISOString();

  const [
    { data: s },
    { data: u },
    { data: chats },
    { count: chatCount },
    { count: msgCount },
    { count: missionCount },
    xpInfo,
    badgeList,
    evList,
    memStats,
    { data: recentMissions },
  ] = await Promise.all([
    supabase
      .from("streaks")
      .select("current_streak, longest_streak")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("usage_daily")
      .select("message_count")
      .eq("user_id", userId)
      .eq("day", today)
      .maybeSingle(),
    supabase
      .from("chats")
      .select("id, title, mode, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase.from("chats").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("missions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("completed", true),
    getUserXP(),
    getBadges(),
    recentXPEvents(15),
    memoryStats(),
    supabase
      .from("missions")
      .select("assigned_date, completed")
      .eq("user_id", userId)
      .gte("assigned_date", weekStart.slice(0, 10)),
  ]);

  // Weekly bar (last 7 days of completed missions)
  const buckets: number[] = new Array(7).fill(0);
  const midnight = new Date().setHours(0, 0, 0, 0);
  for (const m of recentMissions ?? []) {
    if (!m.completed) continue;
    const d = new Date(m.assigned_date + "T00:00:00");
    const diff = Math.floor((midnight - d.getTime()) / 86400_000);
    if (diff >= 0 && diff < 7) buckets[6 - diff] += 1;
  }

  const { data: existing } = await supabase
    .from("missions")
    .select("*")
    .eq("user_id", userId)
    .eq("assigned_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    streak: { current: s?.current_streak ?? 0, longest: s?.longest_streak ?? 0 },
    usage: u?.message_count ?? 0,
    recentChats: (chats ?? []) as DashboardSnapshot["recentChats"],
    xp: xpInfo,
    badges: badgeList,
    events: evList,
    weekly: buckets,
    totals: {
      chats: chatCount ?? 0,
      messages: msgCount ?? 0,
      missions: missionCount ?? 0,
      memories: memStats.total,
    },
    mission: (existing ?? null) as DashboardMission,
  };
}

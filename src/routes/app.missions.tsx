import { createFileRoute } from "@tanstack/react-router";
import { useUserTitle } from "@/hooks/use-title";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNowMs } from "@/hooks/use-clock";
import { useRealtimeRefresh } from "@/hooks/use-realtime";

import { CheckCircle2, Loader2, Flame, Trophy, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/missions")({
  head: () => ({
    meta: [
      { title: "Daily Missions — RizzGod AI" },
      {
        name: "description",
        content:
          "One real-world challenge a day. Track your mission streak and turn confidence into a habit with RizzGod AI.",
      },
      { property: "og:title", content: "Daily Missions — RizzGod AI" },
      {
        property: "og:description",
        content: "One real-world challenge a day. Build the confidence streak with RizzGod AI.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/missions" },
      { name: "twitter:title", content: "Daily Missions — RizzGod AI" },
      {
        name: "twitter:description",
        content: "One real-world challenge a day. Build the confidence streak with RizzGod AI.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/missions" }],
  }),
  component: MissionsPage,
});

type Mission = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  completed: boolean;
  assigned_date: string;
  completed_at: string | null;
  category?: string | null;
  estimated_time?: string | null;
  why_this_matters?: string | null;
  completion_action?: string | null;
  coach_tip?: string | null;
};

function MissionsPage() {
  const { user } = useAuth();
  const nowMs = useNowMs(60_000);
  const [generating, setGenerating] = useState(false);

  // Data loading lives in TanStack Query rather than a fetch-in-effect so the
  // component never triggers cascading renders from an effect body.
  const {
    data,
    isPending,
    refetch: load,
  } = useQuery({
    queryKey: ["missions", user?.id],
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    queryFn: async () => {
      const [{ data: m }, { data: s }] = await Promise.all([
        supabase
          .from("missions")
          .select("*")
          .eq("user_id", user!.id)
          .order("assigned_date", { ascending: false })
          .limit(60),
        supabase
          .from("streaks")
          .select("current_streak, longest_streak")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      return {
        missions: (m ?? []) as Mission[],
        streak: { current: s?.current_streak ?? 0, longest: s?.longest_streak ?? 0 },
      };
    },
  });

  const missions = data?.missions ?? [];
  const streak = data?.streak ?? { current: 0, longest: 0 };
  const loading = isPending;

  // Live refresh via Supabase Realtime (RLS-scoped to the caller's own rows).
  useRealtimeRefresh({
    channel: "missions",
    userId: user?.id ?? null,
    tables: [{ table: "missions" }, { table: "streaks" }, { table: "user_xp" }],
    onChange: () => void load(),
  });

  const generateToday = async () => {
    if (generating) return;
    setGenerating(true);
    const cid =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;
    console.log(`[daily_mission][cid=${cid}] client.request`, { source: "missions_page" });
    try {
      const { generateDailyMissionFn } = await import("@/lib/mission.functions");
      const res = await generateDailyMissionFn({ data: { correlationId: cid } });
      console.log(`[daily_mission][cid=${cid}] client.response`, {
        ok: !!res?.mission,
        cached: "cached" in res ? res.cached : null,
        serverCid: res?.correlationId ?? null,
      });
      if (res?.mission) {
        if ("cached" in res && res.cached) toast("Today's mission already loaded.");
        else toast.success("New mission unlocked.");
        await load();
      } else {
        toast.error("Couldn't generate a mission.");
      }
    } catch (e) {
      console.error(`[daily_mission][cid=${cid}] client.error`, e);
      toast.error("Couldn't generate a mission.");
    } finally {
      setGenerating(false);
    }
  };

  const complete = async (m: Mission) => {
    let res: {
      updated: boolean;
      current_streak: number;
      longest_streak: number;
      streak_advanced: boolean;
      xp?: { delta: number; newTotal: number; level: number } | null;
    } | null = null;
    try {
      const { completeMissionFn } = await import("@/lib/xp.functions");
      res = await completeMissionFn({ data: { missionId: m.id } });
    } catch {
      /* handled below */
    }
    if (!res) {
      toast.error("Failed.");
      return;
    }
    if (!res.updated) {
      toast("Already completed today.");
    } else {
      const xpMsg = res.xp?.delta ? ` · +${res.xp.delta} XP` : "";
      toast.success(`✓ Mission crushed — ${res.current_streak}-day streak${xpMsg}`);
    }
    load();
  };

  // Build last-7-days completion map
  const last7 = useMemo(() => {
    const days: { date: string; label: string; done: boolean; count: number }[] = [];
    const base = nowMs || 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(base - i * 86400000);
      const date = d.toISOString().slice(0, 10);
      const dayMissions = missions.filter((m) => m.assigned_date === date);
      const done = dayMissions.some((m) => m.completed);
      days.push({
        date,
        label: d.toLocaleDateString(undefined, { weekday: "short" })[0],
        done,
        count: dayMissions.filter((m) => m.completed).length,
      });
    }
    return days;
  }, [missions, nowMs]);

  const weeklyDone = last7.filter((d) => d.done).length;
  const weeklyPct = Math.round((weeklyDone / 7) * 100);

  const totalMissions = missions.length;
  const totalDone = missions.filter((m) => m.completed).length;
  const lifetimePct = totalMissions ? Math.round((totalDone / totalMissions) * 100) : 0;

  const today = new Date(nowMs || 0).toISOString().slice(0, 10);
  const todaysMissions = missions.filter((m) => m.assigned_date === today);
  const pastMissions = missions.filter((m) => m.assigned_date !== today);

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-4xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
        <div>
          <div className="text-xs text-gold uppercase tracking-widest font-bold mb-1">
            Daily Missions
          </div>
          <h1 className="display text-3xl md:text-4xl">
            Real action. <span className="text-gradient-blood">Every day.</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{title.sentence("One rep at a time")}</p>
        </div>
      </div>

      {/* Progress tracker */}
      <div className="bg-card border border-gold/30 rounded-2xl p-5 md:p-6 mb-6 shadow-card relative overflow-hidden">
        <div className="absolute -top-12 -right-12 h-40 w-40 bg-gradient-gold opacity-10 blur-3xl rounded-full" />

        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-5">
          <Stat
            icon={<Flame size={16} />}
            label="Current"
            value={`${streak.current}d`}
            accent="blood"
          />
          <Stat
            icon={<Trophy size={16} />}
            label="Longest"
            value={`${streak.longest}d`}
            accent="gold"
          />
          <Stat
            icon={<TrendingUp size={16} />}
            label="Lifetime"
            value={`${lifetimePct}%`}
            accent="gold"
          />
        </div>

        {/* Weekly bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
              This week
            </div>
            <div className="text-xs font-bold text-gold">
              {weeklyDone}/7 days · {weeklyPct}%
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-gold transition-all duration-500"
              style={{ width: `${weeklyPct}%` }}
            />
          </div>
        </div>

        {/* 7-day dots */}
        <div className="grid grid-cols-7 gap-1.5 mt-4">
          {last7.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <div
                title={`${d.date} — ${d.done ? "completed" : "missed"}`}
                className={`h-9 w-full rounded-lg flex items-center justify-center text-xs font-bold transition ${
                  d.done
                    ? "bg-gradient-blood text-primary-foreground shadow-blood"
                    : "bg-secondary text-muted-foreground border border-border/40"
                }`}
              >
                {d.done ? "✓" : "·"}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase font-bold">{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-gold" />
        </div>
      ) : missions.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-muted-foreground">No missions yet. Generate your first one.</p>
          <button
            onClick={generateToday}
            disabled={generating}
            className="bg-gradient-blood text-primary-foreground font-bold px-5 py-2.5 rounded-lg shadow-blood disabled:opacity-60"
          >
            {generating ? "Generating…" : "Generate today's mission"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {todaysMissions.length === 0 && (
            <div className="bg-card border border-gold/30 rounded-2xl p-5 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs uppercase tracking-widest font-bold text-gold mb-1">
                  Today
                </div>
                <p className="text-sm text-muted-foreground">
                  No mission for today yet — spin up a personalized one.
                </p>
              </div>
              <button
                onClick={generateToday}
                disabled={generating}
                className="bg-gradient-blood text-primary-foreground font-bold px-4 py-2 rounded-lg shadow-blood disabled:opacity-60 whitespace-nowrap"
              >
                {generating ? "Generating…" : "Generate today"}
              </button>
            </div>
          )}
          {todaysMissions.length > 0 && (
            <Section title="Today" missions={todaysMissions} onComplete={complete} />
          )}
          {pastMissions.length > 0 && (
            <Section title="History" missions={pastMissions} onComplete={complete} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  missions,
  onComplete,
}: {
  title: string;
  missions: Mission[];
  onComplete: (m: Mission) => void;
}) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">
        {title}
      </h2>
      <div className="space-y-3">
        {missions.map((m) => (
          <div
            key={m.id}
            className={`bg-card border rounded-2xl p-5 transition ${m.completed ? "border-success/40 opacity-75" : "border-border/60"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${m.difficulty === "hard" ? "bg-destructive/20 text-destructive" : m.difficulty === "easy" ? "bg-success/20 text-success" : "bg-gold/20 text-gold"}`}
                  >
                    {m.difficulty}
                  </span>
                  {m.category ? (
                    <span className="px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] bg-secondary text-muted-foreground">
                      {m.category}
                    </span>
                  ) : null}
                  {m.estimated_time ? (
                    <span className="text-[10px]">⏱ {m.estimated_time}</span>
                  ) : null}
                  <span>{new Date(m.assigned_date).toLocaleDateString()}</span>
                </div>
                <h3 className="display text-xl mb-1">{m.title}</h3>
                <p className="text-sm text-muted-foreground">{m.description}</p>
                {m.why_this_matters ? (
                  <p className="text-xs text-muted-foreground/80 mt-2 border-l-2 border-gold/40 pl-2">
                    <span className="font-bold text-gold uppercase tracking-widest text-[10px] block mb-0.5">
                      Why this matters
                    </span>
                    {m.why_this_matters}
                  </p>
                ) : null}
                {m.coach_tip ? (
                  <p className="text-xs text-muted-foreground/80 mt-2 border-l-2 border-primary/40 pl-2">
                    <span className="font-bold text-primary uppercase tracking-widest text-[10px] block mb-0.5">
                      Coach tip
                    </span>
                    {m.coach_tip}
                  </p>
                ) : null}
              </div>
              {m.completed ? (
                <CheckCircle2 className="text-success shrink-0" size={28} />
              ) : (
                <button
                  onClick={() => onComplete(m)}
                  className="bg-gradient-blood text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm shadow-blood whitespace-nowrap"
                >
                  Crush it
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blood" | "gold";
}) {
  return (
    <div className="bg-background/60 border border-border/40 rounded-xl p-3">
      <div
        className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold mb-1 ${accent === "blood" ? "text-primary" : "text-gold"}`}
      >
        {icon} {label}
      </div>
      <div className="display text-xl md:text-2xl">{value}</div>
    </div>
  );
}

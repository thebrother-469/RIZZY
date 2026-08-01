import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { newCorrelationId } from "@/lib/correlation";
import { loadDashboard, type DashboardSnapshot, type DashboardMission } from "@/lib/dashboard-data";
import { useRealtimeRefresh } from "@/hooks/use-realtime";
import { useUserTitle } from "@/hooks/use-title";

import {
  Flame,
  MessageSquareText,
  Image as ImageIcon,
  Theater,
  Target,
  TrendingUp,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Zap,
  Trophy,
  Brain,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  awardXP,
  awardBadge,
  getUserXP,
  getBadges,
  recentXPEvents,
  eventLabel,
  BADGES,
} from "@/lib/xp";
import { memoryStats } from "@/lib/memory";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";

export const Route = createFileRoute("/app/")({
  head: () => ({
    meta: [
      { title: "Dashboard — RizzGod AI" },
      {
        name: "description",
        content:
          "Your RizzGod AI dashboard: track streaks, XP, daily missions, and recent practice sessions in one place.",
      },
      { property: "og:title", content: "Dashboard — RizzGod AI" },
      {
        property: "og:description",
        content: "Track your streaks, XP, and daily missions in the RizzGod AI dashboard.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app" },
      { name: "twitter:title", content: "Dashboard — RizzGod AI" },
      {
        name: "twitter:description",
        content: "Track your streaks, XP, and daily missions in the RizzGod AI dashboard.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app" }],
  }),
  component: Dashboard,
});

type Mission = {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  completed: boolean;
};

function Dashboard() {
  const { user, plan, refreshPlan } = useAuth();
  const title = useUserTitle();

  // After a successful Lemon Squeezy checkout the browser lands on /app?upgraded=<plan>.
  // Webhooks are async, so poll refreshPlan for up to ~30s until the plan flips.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const upgraded = url.searchParams.get("upgraded");
    if (!upgraded) return;
    let tries = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      tries++;
      await refreshPlan();
      if (tries >= 15) {
        stopped = true;
        toast.success(`Welcome to ${upgraded === "elite" ? "Elite" : "Pro"}. You're locked in.`);
        url.searchParams.delete("upgraded");
        window.history.replaceState({}, "", url.toString());
        return;
      }
      setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [refreshPlan]);
  const queryClient = useQueryClient();
  const dashboardKey = ["dashboard", user?.id] as const;
  const [loadingMission, setLoadingMission] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: dashboardKey,
    enabled: !!user?.id,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    queryFn: () => loadDashboard(user!.id),
  });

  const loadAll = () => {
    void refetch();
  };

  const streak = data?.streak ?? { current: 0, longest: 0 };
  const usage = data?.usage ?? 0;
  const recentChats = data?.recentChats ?? [];
  const xp = data?.xp ?? null;
  const badges = data?.badges ?? [];
  const events = data?.events ?? [];
  const weekly = data?.weekly ?? [0, 0, 0, 0, 0, 0, 0];
  const totals = data?.totals ?? { chats: 0, messages: 0, missions: 0, memories: 0 };
  const mission = data?.mission ?? null;

  const patchDashboard = (patch: Partial<DashboardSnapshot>) => {
    queryClient.setQueryData<DashboardSnapshot>(dashboardKey, (old) =>
      old ? { ...old, ...patch } : old,
    );
  };

  const generateMission = async () => {
    setLoadingMission(true);
    const cid = newCorrelationId();
    console.log(`[daily_mission][cid=${cid}] client.request`, { source: "dashboard" });
    try {
      const { generateDailyMissionFn } = await import("@/lib/mission.functions");
      const res = await generateDailyMissionFn({ data: { correlationId: cid } });
      console.log(`[daily_mission][cid=${cid}] client.response`, {
        ok: !!res?.mission,
        cached: "cached" in res ? res.cached : null,
        serverCid: res?.correlationId ?? null,
      });
      if (res?.mission) patchDashboard({ mission: res.mission as DashboardMission });
      else toast.error("Couldn't load mission");
    } catch (e) {
      console.error(`[daily_mission][cid=${cid}] client.error`, e);
      toast.error("Mission load failed.");
    } finally {
      setLoadingMission(false);
    }
  };

  // Live refresh via Supabase Realtime (RLS-scoped to the caller's own rows).
  useRealtimeRefresh({
    channel: "dashboard",
    userId: user?.id ?? null,
    tables: [
      { table: "missions" },
      { table: "user_xp" },
      { table: "streaks" },
      { table: "badges" },
      { table: "subscriptions" },
    ],
    onChange: () => void loadAll(),
  });

  const completeMission = async () => {
    if (!mission || !user) return;
    // Guard: refuse to submit an unpersisted / phantom mission id. The
    // server's last-resort fallback returns { persisted: false, id: null }
    // when the DB insert failed; calling complete_mission with such an id
    // would raise SQLSTATE P0002 "mission not found".
    if ((mission as { persisted?: boolean }).persisted === false || !mission.id) {
      toast.error("Mission wasn't saved — regenerating.");
      void generateMission();
      return;
    }
    let res: {
      updated: boolean;
      current_streak: number;
      longest_streak: number;
      streak_advanced: boolean;
      xp: { delta: number; newTotal: number; level: number } | null;
    } | null = null;
    try {
      const { completeMissionFn } = await import("@/lib/xp.functions");
      res = await completeMissionFn({ data: { missionId: mission.id } });
    } catch {
      /* handled below */
    }
    if (!res) {
      toast.error("Failed.");
      return;
    }
    const newCurrent = res.current_streak;

    toast.success(`+${res.xp?.delta ?? 50} XP • ${newCurrent}-day streak 🔥`);
    patchDashboard({
      mission: { ...mission, completed: true },
      streak: { current: newCurrent, longest: res.longest_streak },
    });
    void loadAll();
  };

  const QUICK = [
    {
      to: "/app/chat",
      label: "Practice",
      desc: "Drop a line, get scored",
      icon: MessageSquareText,
    },
    { to: "/app/roast", label: "Roast My DMs", desc: "Upload screenshots", icon: ImageIcon },
    { to: "/app/roleplay", label: "Roleplay", desc: "Live date sims", icon: Theater },
    { to: "/app/missions", label: "Missions", desc: "Real-world action", icon: Target },
  ] as const;

  // Confidence score: composite (0-100)
  const confidenceScore = Math.min(
    100,
    Math.round(
      streak.current * 4 +
        totals.missions * 2 +
        Math.min(30, totals.messages / 5) +
        Math.min(20, totals.memories * 2),
    ),
  );

  const xpPct = xp ? Math.round((xp.xp_into_level / xp.xp_needed) * 100) : 0;
  const weeklyMax = Math.max(1, ...weekly);
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const now = new Date();
  const orderedLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86400_000);
    return dayLabels[(d.getDay() + 6) % 7];
  });

  return (
    <div className="px-4 md:px-8 py-6 md:py-10 max-w-6xl mx-auto space-y-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs text-gold uppercase tracking-widest font-bold mb-1">
            {title.greeting("Welcome back")}
          </div>
          <h1 className="display text-3xl md:text-5xl break-words">
            Let's <span className="text-gradient-blood">level up</span> today.
          </h1>
        </div>
        {xp && (
          <div className="shrink-0 bg-card border border-gold/40 rounded-xl px-4 py-2.5 min-w-[140px]">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-gold">
              <Zap size={12} /> Level {xp.level}
            </div>
            <div className="display text-xl leading-tight">{xp.total_xp} XP</div>
            <div className="h-1 bg-secondary rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-gradient-gold" style={{ width: `${xpPct}%` }} />
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {xp.xp_needed - xp.xp_into_level} to next
            </div>
          </div>
        )}
      </header>

      {/* Confidence score hero */}
      <section
        aria-labelledby="confidence-heading"
        className="bg-card border border-primary/30 rounded-2xl p-6 relative overflow-hidden"
      >
        <div className="absolute -top-16 -right-16 h-48 w-48 bg-gradient-blood opacity-15 blur-3xl rounded-full" />
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-5 items-center">
          <ConfidenceRing score={confidenceScore} />
          <div className="min-w-0">
            <h2
              id="confidence-heading"
              className="text-xs text-primary uppercase tracking-widest font-bold mb-1"
            >
              Confidence score
            </h2>
            <div className="display text-2xl md:text-3xl mb-1">
              {confidenceScore >= 80
                ? "Elite operator"
                : confidenceScore >= 50
                  ? "Rising heat"
                  : confidenceScore >= 20
                    ? "Warming up"
                    : "Just getting started"}
            </div>
            <p className="text-sm text-muted-foreground">
              Built from your streak, missions, coaching reps, and memory depth. Ship more, score
              climbs.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Your stats
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            icon={<Flame size={18} />}
            label="Streak"
            value={`${streak.current}d`}
            hot={streak.current > 0}
          />
          <Stat icon={<TrendingUp size={18} />} label="Longest" value={`${streak.longest}d`} />
          <Stat
            icon={<MessageSquareText size={18} />}
            label="Today's reps"
            value={`${usage}`}
            sub={plan === "free" ? "/ 10 free" : "unlimited"}
          />
          <Stat icon={<Trophy size={18} />} label="Plan" value={plan.toUpperCase()} gold />
        </div>
      </section>

      {/* Two-column: mission + weekly */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Daily mission */}
        <div className="lg:col-span-2 bg-card border border-gold/30 rounded-2xl p-6 shadow-card relative overflow-hidden">
          <div className="absolute -top-12 -right-12 h-40 w-40 bg-gradient-gold opacity-10 blur-3xl rounded-full" />
          <h2 className="flex items-center gap-2 text-gold text-xs font-bold uppercase tracking-widest mb-2">
            <Target size={14} /> Today's mission
          </h2>
          {loadingMission ? (
            <div className="flex items-center gap-2 py-4 text-muted-foreground">
              <Loader2 className="animate-spin" /> Cooking up your mission...
            </div>
          ) : mission ? (
            <>
              <h2 className="display text-2xl md:text-3xl mb-2">{mission.title}</h2>
              <p className="text-muted-foreground mb-4 text-sm md:text-base">
                {mission.description}
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <span
                  className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${mission.difficulty === "hard" ? "bg-destructive/20 text-destructive" : mission.difficulty === "easy" ? "bg-success/20 text-success" : "bg-gold/20 text-gold"}`}
                >
                  {mission.difficulty}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full bg-primary/15 text-primary">
                  +50 XP
                </span>
                {mission.completed ? (
                  <span className="inline-flex items-center gap-1.5 text-success font-semibold text-sm ml-auto">
                    <CheckCircle2 size={18} /> Crushed it
                  </span>
                ) : (
                  <button
                    onClick={completeMission}
                    className="ml-auto bg-gradient-blood text-primary-foreground font-bold px-5 py-2.5 rounded-lg shadow-blood text-sm"
                  >
                    Mark as crushed
                  </button>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={generateMission}
              className="bg-gradient-blood text-primary-foreground font-bold px-5 py-2.5 rounded-lg shadow-blood"
            >
              Generate today's mission
            </button>
          )}
        </div>

        {/* Weekly activity */}
        <div className="bg-card border border-border/60 rounded-2xl p-5">
          <h2 className="flex items-center gap-2 text-xs text-gold uppercase tracking-widest font-bold mb-3">
            <TrendingUp size={12} /> Weekly wins
          </h2>
          <div className="flex items-end gap-1.5 h-24 mb-2">
            {weekly.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
                <div
                  className={`w-full rounded-t ${v > 0 ? "bg-gradient-blood" : "bg-secondary/60"}`}
                  style={{ height: `${(v / weeklyMax) * 100}%`, minHeight: v > 0 ? "8px" : "2px" }}
                />
                <div className="text-[9px] text-muted-foreground font-bold">{orderedLabels[i]}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            {weekly.reduce((a, b) => a + b, 0)} missions this week
          </div>
        </div>
      </div>

      {/* 30-day activity heatmap */}
      <ActivityHeatmap />

      {/* Badges + Lifetime */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-card border border-border/60 rounded-2xl p-5">
          <h2 className="flex items-center gap-2 text-xs text-gold uppercase tracking-widest font-bold mb-3">
            <Trophy size={12} /> Badges earned
          </h2>
          {badges.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">
              No badges yet. Crush a mission or hit a 3-day streak to unlock your first.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => {
                const meta = BADGES[b.badge_key];
                if (!meta) return null;
                return (
                  <div
                    key={b.badge_key}
                    className="flex items-center gap-2 bg-secondary/50 border border-gold/30 rounded-xl px-3 py-2"
                  >
                    <span className="text-xl">{meta.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{meta.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {meta.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card border border-border/60 rounded-2xl p-5">
          <h2 className="flex items-center gap-2 text-xs text-gold uppercase tracking-widest font-bold mb-3">
            <Sparkles size={12} /> Lifetime
          </h2>
          <ul className="space-y-2 text-sm">
            <LifeStat label="Missions crushed" value={totals.missions} />
            <LifeStat label="Coaching reps" value={totals.messages} />
            <LifeStat label="Conversations" value={totals.chats} />
            <LifeStat label="Memories saved" value={totals.memories} />
          </ul>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="display text-2xl mb-3">Train now</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {QUICK.map((q, i) => (
            <Link
              key={q.to}
              to={q.to}
              className="bg-card border border-border/60 rounded-xl p-4 hover:border-gold/40 transition group"
            >
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${i % 2 ? "bg-gradient-gold text-gold-foreground" : "bg-gradient-blood text-primary-foreground"}`}
              >
                <q.icon size={18} />
              </div>
              <div className="font-bold text-sm md:text-base">{q.label}</div>
              <div className="text-xs text-muted-foreground">{q.desc}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column: activity + recent chats */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="display text-xl mb-3 flex items-center gap-2">
            <Zap size={16} className="text-gold" /> Activity
          </h2>
          <div className="bg-card border border-border/60 rounded-xl divide-y divide-border/50">
            {events.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Your actions will show up here.
              </div>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                    +{e.xp_delta}
                  </div>
                  <div className="flex-1 min-w-0 truncate">{eventLabel(e.event_type)}</div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="display text-xl mb-3 flex items-center gap-2">
            <Brain size={16} className="text-gold" /> Pick back up
          </h2>
          {recentChats.length === 0 ? (
            <div className="bg-card border border-dashed border-border/60 rounded-xl p-6 text-sm text-muted-foreground text-center">
              No conversations yet.{" "}
              <Link to="/app/coaches" className="text-primary underline">
                Meet your coaches
              </Link>
              .
            </div>
          ) : (
            <div className="space-y-2">
              {recentChats.map((c) => (
                <Link
                  key={c.id}
                  to="/app/chat"
                  search={{ id: c.id }}
                  className="flex items-center gap-3 bg-card border border-border/60 rounded-xl px-4 py-3 hover:border-gold/40 transition"
                >
                  <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center text-gold shrink-0">
                    <MessageSquareText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{c.title}</div>
                    <div className="text-xs text-muted-foreground capitalize">{c.mode}</div>
                  </div>
                  <ArrowRight size={16} className="text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  hot,
  gold,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  hot?: boolean;
  gold?: boolean;
}) {
  return (
    <div
      className={`bg-card border rounded-xl p-4 ${gold ? "border-gold/40" : "border-border/60"}`}
    >
      <div
        className={`flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold mb-1 ${hot ? "text-primary" : gold ? "text-gold" : "text-muted-foreground"}`}
      >
        {icon} {label}
      </div>
      <div className="display text-2xl md:text-3xl">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function LifeStat({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </li>
  );
}

function ConfidenceRing({ score }: { score: number }) {
  const size = 100;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="var(--secondary)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#confGrad)"
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <defs>
        <linearGradient id="confGrad" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="var(--gold)" />
        </linearGradient>
      </defs>
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground"
        style={{ fontSize: 26, fontWeight: 900 }}
      >
        {score}
      </text>
    </svg>
  );
}

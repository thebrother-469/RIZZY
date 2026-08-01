import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useNowMs } from "@/hooks/use-clock";
import { Calendar } from "lucide-react";

const DAYS = 30;

export function ActivityHeatmap() {
  const { user } = useAuth();
  const nowMs = useNowMs(60_000);
  const [data, setData] = useState<number[]>(Array(DAYS).fill(0));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    const since = new Date(Date.now() - (DAYS - 1) * 86400_000);
    since.setHours(0, 0, 0, 0);
    supabase
      .from("xp_events")
      .select("created_at, xp_delta")
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString())
      .then(({ data: rows }) => {
        const buckets = new Array(DAYS).fill(0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        (rows ?? []).forEach((r) => {
          const d = new Date(r.created_at);
          d.setHours(0, 0, 0, 0);
          const idx = Math.floor((now.getTime() - d.getTime()) / 86400_000);
          const slot = DAYS - 1 - idx;
          if (slot >= 0 && slot < DAYS) buckets[slot] += r.xp_delta ?? 1;
        });
        setData(buckets);
        setLoaded(true);
      });
  }, [user?.id]);

  const max = Math.max(1, ...data);
  const intensity = (v: number) => {
    if (v <= 0) return 0;
    const r = v / max;
    if (r < 0.2) return 1;
    if (r < 0.45) return 2;
    if (r < 0.75) return 3;
    return 4;
  };
  const cls = [
    "bg-secondary/40",
    "bg-primary/25",
    "bg-primary/50",
    "bg-primary/75",
    "bg-gradient-blood shadow-blood",
  ];

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-gold uppercase tracking-widest font-bold">
          <Calendar size={12} /> Last 30 days
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {cls.map((c, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-sm ${c}`} />
          ))}
          <span>More activity</span>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(30,minmax(0,1fr))] gap-1">
        {data.map((v, i) => {
          const d = nowMs ? new Date(nowMs - (DAYS - 1 - i) * 86400_000) : null;
          return (
            <div
              key={i}
              title={d ? `${d.toLocaleDateString()} · ${v} XP` : `${v} XP`}

              className={`aspect-square rounded-sm ${cls[intensity(v)]} ${loaded ? "" : "animate-pulse"}`}
            />
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground mt-2">
        {data.reduce((a, b) => a + b, 0)} XP earned in the last 30 days
      </div>
    </div>
  );
}

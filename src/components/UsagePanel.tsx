import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getProfileGenUsage } from "@/lib/profile-generator.functions";
import { useNowMs } from "@/hooks/use-clock";
import { Sparkles, Loader2, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Usage = {
  plan: "free" | "pro" | "elite";
  used: number;
  limit: number | null;
  remaining: number | null;
  reset_time: string;
};

function formatCountdown(iso: string, now: number): string {
  if (!now) return "soon"; // clock not yet ticked (SSR / first paint)
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "resetting…";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 1) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Account usage panel. Renders today's profile-generator usage, plan tier,
 * remaining quota, and a live countdown to the UTC reset. Refetches on mount,
 * on window focus, and whenever the `profile-gen:used` custom event fires
 * (dispatched from the profile generator after a successful call).
 */
export function UsagePanel() {
  const fetchUsage = useServerFn(getProfileGenUsage);
  const now = useNowMs(30_000);

  const {
    data: usage,
    isPending: loading,
    refetch,
  } = useQuery<Usage>({
    queryKey: ["profile-gen-usage"],
    queryFn: async () => (await fetchUsage()) as Usage,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    retry: 1,
  });

  // External trigger: the profile generator dispatches this after a call.
  useEffect(() => {
    const onEvt = () => void refetch();
    window.addEventListener("profile-gen:used", onEvt as EventListener);
    return () => window.removeEventListener("profile-gen:used", onEvt as EventListener);
  }, [refetch]);

  if (loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 flex items-center gap-3 text-white/60">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading usage…
      </div>
    );
  }
  if (!usage) return null;

  const isUnlimited = usage.limit == null;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((usage.used / usage.limit!) * 100));
  const nearCap = !isUnlimited && usage.remaining! <= Math.max(1, Math.floor(usage.limit! * 0.2));
  const planLabel = usage.plan === "free" ? "Free" : usage.plan === "pro" ? "Pro" : "Elite";

  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.02] p-6"
      data-testid="usage-panel"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/50 mb-1">
            Profile Generator — Today
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {isUnlimited ? (
              <span>Unlimited</span>
            ) : (
              <span data-testid="usage-count">
                {usage.used} <span className="text-white/40 text-lg">/ {usage.limit}</span>
              </span>
            )}
          </div>
          <div className="text-sm text-white/60 mt-1">
            {planLabel} plan · resets in {formatCountdown(usage.reset_time, now)}
          </div>
        </div>
        <Sparkles className={`w-5 h-5 ${nearCap ? "text-amber-400" : "text-white/40"}`} />
      </div>

      {!isUnlimited && (
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full transition-all ${nearCap ? "bg-amber-400" : "bg-white/70"}`}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      )}

      {usage.plan !== "elite" && (
        <div className="mt-5">
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white underline underline-offset-4"
          >
            {usage.plan === "free" ? "Upgrade to Pro for 30/day" : "Upgrade to Elite for unlimited"}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

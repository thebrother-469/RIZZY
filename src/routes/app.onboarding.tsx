import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { newCorrelationId } from "@/lib/correlation";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Check, Loader2, Flame } from "lucide-react";
import { awardXP, awardBadge } from "@/lib/xp";
import { createMemory } from "@/lib/memory";
import { errorMessage, errorName, errorStatus } from "@/lib/errors";

export const Route = createFileRoute("/app/onboarding")({
  head: () => ({
    meta: [
      { title: "Get Started — RizzGod AI Onboarding" },
      {
        name: "description",
        content:
          "Set up your RizzGod AI profile in under a minute — goals, style, and personalization so your coach hits from day one.",
      },
      { property: "og:title", content: "Get Started — RizzGod AI Onboarding" },
      {
        property: "og:description",
        content: "Quick onboarding to personalize your RizzGod AI dating coach.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/onboarding" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/onboarding" }],
  }),
  component: Onboarding,
});

type State = {
  age_range: string;
  dating_experience: string;
  confidence_level: number;
  social_challenges: string[];
  goals: string;
  interests: string[];
  coaching_style: string;
  notif_email: boolean;
  memory_enabled: boolean;
};

const AGES = ["18-24", "25-29", "30-34", "35-44", "45+"];
const EXP = ["Total beginner", "Rusty", "Some experience", "Experienced", "Advanced"];
const CHALLENGES = [
  "Approach anxiety",
  "Small talk",
  "Texting",
  "First dates",
  "Escalation",
  "Reading signals",
  "One-itis",
  "LTR spark",
  "Rejection",
];
const INTERESTS = [
  "Fitness",
  "Business",
  "Travel",
  "Music",
  "Art",
  "Reading",
  "Tech",
  "Sports",
  "Cooking",
  "Nightlife",
  "Outdoors",
  "Cars",
];
const STYLES = [
  { key: "brutal", label: "Brutal honesty", desc: "No sugarcoating. Straight raw truth." },
  { key: "hype", label: "Hype coach", desc: "Energy, momentum, confidence." },
  { key: "strategic", label: "Strategic", desc: "Calm, tactical, step-by-step." },
  { key: "mentor", label: "Mentor", desc: "Warm, patient, wise older brother." },
];

const STEPS = [
  "Welcome",
  "Age",
  "Experience",
  "Confidence",
  "Challenges",
  "Goals",
  "Interests",
  "Style",
  "Preferences",
  "Complete",
] as const;

function Onboarding() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  // Single-flight lock: guarantees exactly-one completion attempt in-flight
  // regardless of double-clicks, React re-renders, or focus/blur restarts.
  const finishingRef = useRef(false);
  // Idempotency guard for the multi-tab BroadcastChannel — only the tab that
  // actually performs completion should navigate via its own finish() path;
  // sibling tabs navigate through the channel listener.
  const navigatedRef = useRef(false);
  const [s, setS] = useState<State>({
    age_range: "",
    dating_experience: "",
    confidence_level: 5,
    social_challenges: [],
    goals: "",
    interests: [],
    coaching_style: "",
    notif_email: true,
    memory_enabled: true,
  });

  // Read-once on mount: if the DB already says onboarded, skip the flow.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.onboarded_at && !navigatedRef.current) {
          navigatedRef.current = true;
          nav({ to: "/app", replace: true });
        }
      });
  }, [user?.id]);

  // Multi-tab sync: if another tab completes onboarding, this tab exits too.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let bc: BroadcastChannel | null = null;
    const go = () => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      nav({ to: "/app", replace: true });
    };
    try {
      bc = new BroadcastChannel("rg_onboarding");
      bc.onmessage = (e) => {
        if (e?.data?.type === "complete") go();
      };
    } catch {
      /* BroadcastChannel unsupported; storage event fallback below */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "rg_onboarding_complete") go();
    };
    const onVisibility = async () => {
      if (document.visibilityState !== "visible" || !user) return;
      const { data } = await supabase
        .from("profiles")
        .select("onboarded_at")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.onboarded_at) go();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id]);

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const canNext = () => {
    switch (step) {
      case 1:
        return !!s.age_range;
      case 2:
        return !!s.dating_experience;
      case 4:
        return s.social_challenges.length > 0;
      case 5:
        return s.goals.trim().length >= 5;
      case 6:
        return s.interests.length > 0;
      case 7:
        return !!s.coaching_style;
      default:
        return true;
    }
  };

  // verifyOnboarded / enterArena are correlation-ID-scoped below (see finish()).

  const finish = async () => {
    const cid = newCorrelationId("nofx");

    console.log(`[onboarding][cid=${cid}] client.click_enter_arena`, {
      userId: user?.id ?? null,
    });
    if (!user) {
      console.warn(`[onboarding][cid=${cid}] client.aborted_no_user`);
      return;
    }
    if (finishingRef.current) {
      console.log(`[onboarding][cid=${cid}] client.aborted_in_flight`);
      return;
    }
    finishingRef.current = true;
    setSaving(true);
    try {
      const goalsTrim = s.goals.trim();
      const styleLabel = STYLES.find((x) => x.key === s.coaching_style)?.label;

      const { data: preRow, error: preErr } = await supabase
        .from("profiles")
        .select("id, onboarded_at, age_range, coaching_style, confidence_level, dating_experience")
        .eq("id", user.id)
        .maybeSingle();
      console.log(`[onboarding][cid=${cid}] client.profile.before`, {
        onboarded_at: preRow?.onboarded_at ?? null,
        error: preErr?.message ?? null,
      });

      const {
        error,
        data: updData,
        status: updStatus,
      } = await supabase
        .from("profiles")
        .update({
          age_range: s.age_range || null,
          dating_experience: s.dating_experience || null,
          confidence_level: s.confidence_level,
          social_challenges: s.social_challenges.length ? s.social_challenges : null,
          interests: s.interests.length ? s.interests : null,
          coaching_style: s.coaching_style || null,
          goals: goalsTrim || null,
          memory_enabled: s.memory_enabled,
        })
        .eq("id", user.id)
        .select();
      console.log(`[onboarding][cid=${cid}] client.profile.update`, {
        ok: !error,
        status: updStatus,
        rowsReturned: updData?.length ?? 0,
        error: error?.message ?? null,
      });
      if (error) throw error;

      try {
        localStorage.setItem("rg_notif_email", s.notif_email ? "1" : "0");
      } catch {
        /* ignore */
      }

      if (s.memory_enabled) {
        await Promise.allSettled(
          [
            goalsTrim &&
              createMemory({
                title: "Primary goal",
                content: goalsTrim,
                category: "goals",
                importance: 5,
                pinned: true,
                source: "onboarding",
              }),
            s.social_challenges.length &&
              createMemory({
                title: "Challenges to fix",
                content: s.social_challenges.join(", "),
                category: "weaknesses",
                importance: 4,
                pinned: true,
                source: "onboarding",
              }),
            s.interests.length &&
              createMemory({
                title: "Interests",
                content: s.interests.join(", "),
                category: "preferences",
                importance: 3,
                source: "onboarding",
              }),
            styleLabel &&
              createMemory({
                title: "Coaching style preference",
                content: styleLabel,
                category: "preferences",
                importance: 4,
                pinned: true,
                source: "onboarding",
              }),
          ].filter(Boolean) as Promise<unknown>[],
        );
      }

      console.log(`[onboarding][cid=${cid}] client.completeOnboardingFn.start`);
      const { completeOnboardingFn } = await import("@/lib/xp.functions");
      let delta = 0;
      let rpcSucceeded = false;
      let payload: Awaited<ReturnType<typeof completeOnboardingFn>> | null = null;
      try {
        payload = await completeOnboardingFn({ data: { correlationId: cid } });
        console.log(`[onboarding][cid=${cid}] client.completeOnboardingFn.payload`, {
          xpDelta: payload?.xp?.delta ?? 0,
          serverCid: payload?.correlationId ?? null,
        });
        delta = payload?.xp?.delta ?? 0;
        rpcSucceeded = true;
      } catch (rpcErr: unknown) {
        console.error(`[onboarding][cid=${cid}] client.completeOnboardingFn.threw`, {
          name: errorName(rpcErr),
          message: errorMessage(rpcErr),
          status: errorStatus(rpcErr),
        });
        if (await verifyOnboardedCid(user.id, cid)) {
          enterArenaCid(0, cid);
          return;
        }
        try {
          payload = await completeOnboardingFn({ data: { correlationId: cid } });
          console.log(`[onboarding][cid=${cid}] client.completeOnboardingFn.retry_payload`, {
            xpDelta: payload?.xp?.delta ?? 0,
          });
          delta = payload?.xp?.delta ?? 0;
          rpcSucceeded = true;
        } catch (rpcErr2: unknown) {
          console.error(`[onboarding][cid=${cid}] client.completeOnboardingFn.retry_threw`, {
            name: errorName(rpcErr2),
            message: errorMessage(rpcErr2),
          });
          if (await verifyOnboardedCid(user.id, cid)) {
            enterArenaCid(0, cid);
            return;
          }
          throw rpcErr2;
        }
      }

      if (rpcSucceeded) {
        const verified = await verifyOnboardedCid(user.id, cid);
        console.log(`[onboarding][cid=${cid}] client.final_decision`, {
          rpcSucceeded,
          verified,
          delta,
        });
        enterArenaCid(delta, cid);
      }
    } catch (e: unknown) {
      console.error(`[onboarding][cid=${cid}] client.finish.outer_catch`, {
        message: errorMessage(e),
      });
      try {
        if (user && (await verifyOnboardedCid(user.id, cid))) {
          enterArenaCid(0, cid);
          return;
        }
      } catch {
        /* fall through */
      }
      toast.error(errorMessage(e, "Failed to save. Try again."));
    } finally {
      setSaving(false);
      if (!navigatedRef.current) finishingRef.current = false;
    }
  };

  const verifyOnboardedCid = async (uid: string, cid: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", uid)
      .maybeSingle();
    console.log(`[onboarding][cid=${cid}] client.verifyOnboarded`, {
      onboarded_at: data?.onboarded_at ?? null,
      error: error?.message ?? null,
    });
    return !!data?.onboarded_at;
  };

  const enterArenaCid = (delta: number, cid: string) => {
    console.log(`[onboarding][cid=${cid}] client.navigation`, {
      delta,
      alreadyNavigated: navigatedRef.current,
    });
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    try {
      new BroadcastChannel("rg_onboarding").postMessage({ type: "complete" });
    } catch {
      /* ignore */
    }
    try {
      localStorage.setItem("rg_onboarding_complete", String(Date.now()));
    } catch {
      /* ignore */
    }
    toast.success(delta > 0 ? `Welcome to the arena. +${delta} XP` : "Welcome to the arena.");
    nav({ to: "/app", replace: true });
  };

  const pct = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Progress */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border/60 px-4 md:px-8 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">
            <span className="text-gold">
              Step {step + 1} / {STEPS.length}
            </span>
            <span>{STEPS[step]}</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-blood transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 md:px-8 py-8 max-w-2xl mx-auto w-full">
        {step === 0 && (
          <div className="space-y-6 text-center py-8 animate-in fade-in duration-500">
            <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-blood flex items-center justify-center shadow-blood">
              <Flame size={40} className="text-primary-foreground" />
            </div>
            <h1 className="display text-4xl md:text-5xl">
              Welcome to <span className="text-gradient-blood">RizzGod</span>
            </h1>
            <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto">
              9 quick questions. We tune every coach, mission, and roast to{" "}
              <span className="text-gold font-semibold">you</span> — and you get a personalized
              confidence roadmap.
            </p>
            <div className="text-xs text-muted-foreground">Takes 2 minutes. Skip anything.</div>
          </div>
        )}

        {step === 1 && (
          <Section title="How old are you?" subtitle="We tune advice to your life stage.">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {AGES.map((a) => (
                <Chip
                  key={a}
                  active={s.age_range === a}
                  onClick={() => setS({ ...s, age_range: a })}
                >
                  {a}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section
            title="How much dating experience do you have?"
            subtitle="Be honest. No judgment."
          >
            <div className="space-y-2">
              {EXP.map((e) => (
                <Row
                  key={e}
                  active={s.dating_experience === e}
                  onClick={() => setS({ ...s, dating_experience: e })}
                >
                  {e}
                </Row>
              ))}
            </div>
          </Section>
        )}

        {step === 3 && (
          <Section
            title="Rate your confidence with women."
            subtitle="1 = zero. 10 = certified savage."
          >
            <div className="space-y-4 pt-4">
              <div className="display text-6xl text-gradient-blood text-center">
                {s.confidence_level}
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={s.confidence_level}
                onChange={(e) => setS({ ...s, confidence_level: Number(e.target.value) })}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Terrified</span>
                <span>Elite</span>
              </div>
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section title="Where do you struggle most?" subtitle="Pick all that apply.">
            <div className="flex flex-wrap gap-2">
              {CHALLENGES.map((c) => (
                <Chip
                  key={c}
                  active={s.social_challenges.includes(c)}
                  onClick={() => setS({ ...s, social_challenges: toggle(s.social_challenges, c) })}
                >
                  {c}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {step === 5 && (
          <Section
            title="What's your #1 goal right now?"
            subtitle="One sentence. The rawer the better."
          >
            <textarea
              value={s.goals}
              onChange={(e) => setS({ ...s, goals: e.target.value })}
              rows={4}
              placeholder="Lock in a girlfriend by summer. Or: stop freezing when I approach."
              className="w-full bg-secondary/50 border border-border/60 rounded-xl px-4 py-3 text-base resize-none focus:border-gold/50 outline-none"
            />
          </Section>
        )}

        {step === 6 && (
          <Section title="What are you into?" subtitle="Coaches use this to write in your voice.">
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((c) => (
                <Chip
                  key={c}
                  active={s.interests.includes(c)}
                  onClick={() => setS({ ...s, interests: toggle(s.interests, c) })}
                >
                  {c}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {step === 7 && (
          <Section title="How do you want to be coached?" subtitle="You can change this anytime.">
            <div className="space-y-2">
              {STYLES.map((st) => (
                <button
                  key={st.key}
                  onClick={() => setS({ ...s, coaching_style: st.key })}
                  className={`w-full text-left rounded-xl border p-4 transition ${s.coaching_style === st.key ? "border-gold bg-gold/10" : "border-border/60 hover:border-gold/40"}`}
                >
                  <div className="font-bold text-base">{st.label}</div>
                  <div className="text-xs text-muted-foreground">{st.desc}</div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {step === 8 && (
          <Section title="A couple of preferences." subtitle="You control everything.">
            <ToggleRow
              label="AI memory"
              desc="Coaches remember your goals, wins, and losses across sessions."
              on={s.memory_enabled}
              onChange={(v) => setS({ ...s, memory_enabled: v })}
            />
            <ToggleRow
              label="Email reminders"
              desc="Daily mission drop + streak reminders."
              on={s.notif_email}
              onChange={(v) => setS({ ...s, notif_email: v })}
            />
          </Section>
        )}

        {step === 9 && (
          <div className="space-y-6 text-center py-6 animate-in fade-in duration-500">
            <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-gold flex items-center justify-center shadow-gold">
              <Check size={40} className="text-gold-foreground" />
            </div>
            <h1 className="display text-3xl md:text-4xl">You're locked in.</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Your coaches are calibrated. Your first mission drops the moment you enter the app.
              +100 XP for taking the first rep.
            </p>
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto text-center">
              <MiniStat label="Confidence" value={`${s.confidence_level}/10`} />
              <MiniStat label="Focus" value={`${s.social_challenges.length}`} sub="areas" />
              <MiniStat
                label="Style"
                value={STYLES.find((x) => x.key === s.coaching_style)?.label.split(" ")[0] ?? "—"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="sticky bottom-0 border-t border-border/60 bg-background/90 backdrop-blur px-4 md:px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-2 sm:gap-3">
          {step > 0 && step < STEPS.length - 1 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded-lg px-3 sm:px-4 py-2.5"
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
          <div className="flex-1" />
          {step > 0 && step < STEPS.length - 1 && (
            <button
              onClick={() => setStep(step + 1)}
              aria-label={`Skip ${STEPS[step]} step`}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 rounded-lg px-3 sm:px-4 py-2.5"
            >
              Skip
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className="flex items-center gap-2 bg-gradient-blood text-primary-foreground font-bold px-5 sm:px-6 py-3 rounded-xl shadow-blood disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              {step === 0 ? "Let's go" : "Continue"} <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              className="flex items-center gap-2 bg-gradient-gold text-gold-foreground font-bold px-5 sm:px-6 py-3 rounded-xl shadow-gold disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Saving...
                </>
              ) : (
                <>
                  Enter the arena <ArrowRight size={16} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-300">
      <div>
        <h2 className="display text-2xl md:text-3xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${active ? "bg-gradient-blood text-primary-foreground border-transparent shadow-blood" : "border-border/60 hover:border-gold/40 bg-secondary/40"}`}
    >
      {children}
    </button>
  );
}

function Row({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition flex items-center gap-3 ${active ? "border-gold bg-gold/10" : "border-border/60 hover:border-gold/40"}`}
    >
      <span
        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${active ? "border-gold bg-gold" : "border-muted-foreground"}`}
      >
        {active && <Check size={12} className="text-gold-foreground" />}
      </span>
      <span className="font-semibold">{children}</span>
    </button>
  );
}

function ToggleRow({
  label,
  desc,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-xl border border-border/60 p-4 cursor-pointer hover:border-gold/40 transition">
      <div className="flex-1">
        <div className="font-bold">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-primary mt-1"
      />
    </label>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-wider font-bold text-gold">{label}</div>
      <div className="display text-lg">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useUserTitle } from "@/hooks/use-title";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateDatingProfile, type ProfileGenResult } from "@/lib/profile-generator.functions";
import { Sparkles, Copy, Check, Loader2, Flame, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { fireConfetti } from "@/lib/confetti";
import { resolveProfileGenError } from "@/lib/profile-gen-error";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/app/profile-generator")({
  head: () => ({
    meta: [
      { title: "AI Dating Profile Generator — RizzGod AI" },
      {
        name: "description",
        content:
          "Free AI dating profile generator. Get high-converting Tinder, Hinge, and Bumble bios, prompts, and openers written for your vibe in seconds.",
      },
      { property: "og:title", content: "AI Dating Profile Generator — RizzGod AI" },
      {
        property: "og:description",
        content:
          "Instantly generate Tinder, Hinge, and Bumble profiles that get matches. Powered by RizzGod AI.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/profile-generator" }],
  }),
  component: ProfileGeneratorPage,
});

const VIBES = [
  "Confident & playful",
  "Mysterious high value",
  "Adventurous alpha",
  "Witty & sarcastic",
  "Sweet romantic",
  "Grounded ambitious",
];

function ProfileGeneratorPage() {
  const title = useUserTitle();
  const gen = useServerFn(generateDatingProfile);

  const [hobbies, setHobbies] = useState("");
  const [traits, setTraits] = useState("");
  const [vibe, setVibe] = useState<string>(VIBES[0]);
  const [age, setAge] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProfileGenResult | null>(null);
  // Holds the cleanup for an in-flight celebration so unmounting mid-animation
  // cancels the frame loop and removes the canvas (no leaks, no duplicates).
  const confettiCleanup = useRef<null | (() => void)>(null);
  useEffect(() => () => confettiCleanup.current?.(), []);

  const disabled = loading || (!hobbies.trim() && !traits.trim());

  const submit = async () => {
    if (disabled) return;
    setLoading(true);
    try {
      const out = await gen({ data: { hobbies, traits, vibe, age, looking_for: lookingFor } });
      setResult(out);
      // Success-only celebration: fires exactly once per successful generation.
      confettiCleanup.current?.();
      confettiCleanup.current = fireConfetti();
      // Notify the account usage panel to refetch without a manual reload.
      window.dispatchEvent(new CustomEvent("profile-gen:used"));
      // Scroll result into view on mobile
      setTimeout(() => {
        document
          .getElementById("profile-result")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 40);
    } catch (e: unknown) {
      console.error(e);
      // Server throws JSON-encoded structured errors (quota / rate limit);
      // everything else surfaces its message verbatim.
      const view = resolveProfileGenError(errorMessage(e, ""));
      toast.error(view.message);
      if (view.kind === "quota") {
        window.dispatchEvent(new CustomEvent("profile-gen:used"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="px-4 md:px-8 py-4 border-b border-border/60 bg-card/30">
        <div className="text-xs text-gold uppercase tracking-widest font-bold">
          Profile Generator
        </div>
        <h1 className="display text-2xl md:text-3xl">
          AI dating profile that <span className="text-gradient-blood">actually</span> gets matches.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{title.sentence("Let’s build it")}</p>
      </div>

      <div className="px-4 md:px-8 py-6 md:py-10 max-w-3xl mx-auto w-full">
        <p className="text-muted-foreground text-sm mb-6">
          Tell me who you are. I'll write your Tinder, Hinge, and Bumble profile in seconds — bios,
          prompts, and openers included.
        </p>

        <div className="bg-card border border-border/60 rounded-2xl p-4 md:p-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
              Hobbies / interests
            </label>
            <textarea
              value={hobbies}
              onChange={(e) => setHobbies(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Boxing 3x a week, cooking Thai food, weekend hikes, vinyl collecting, building side projects..."
              className="w-full resize-none bg-background border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
            <div className="text-[10px] text-muted-foreground mt-1 text-right">
              {hobbies.length}/500
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
              Personality traits
            </label>
            <textarea
              value={traits}
              onChange={(e) => setTraits(e.target.value.slice(0, 500))}
              rows={3}
              placeholder="Dry humor, driven, loyal to my people, low tolerance for BS, softie for dogs..."
              className="w-full resize-none bg-background border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
            />
            <div className="text-[10px] text-muted-foreground mt-1 text-right">
              {traits.length}/500
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
              Vibe
            </label>
            <div className="flex flex-wrap gap-2">
              {VIBES.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVibe(v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    vibe === v
                      ? "bg-gradient-blood text-primary-foreground border-transparent shadow-blood"
                      : "border-border/60 text-muted-foreground hover:border-gold/60"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
                Age
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value.slice(0, 10))}
                placeholder="27"
                className="w-full bg-background border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest font-bold text-gold mb-2 block">
                Looking for
              </label>
              <input
                type="text"
                value={lookingFor}
                onChange={(e) => setLookingFor(e.target.value.slice(0, 200))}
                placeholder="Serious relationship / fun dates / whatever hits"
                className="w-full bg-background border border-border/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              />
            </div>
          </div>

          <button
            onClick={submit}
            disabled={disabled}
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-blood text-primary-foreground font-bold px-6 py-3.5 rounded-xl shadow-blood disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? "Cooking..." : result ? "Regenerate" : "Generate my profile"}
          </button>
        </div>

        {result && (
          <div id="profile-result" className="mt-8 space-y-5">
            <div className="text-center">
              <div className="text-xs uppercase tracking-widest text-gold font-bold mb-1">
                Your headline
              </div>
              <div className="display text-2xl md:text-3xl text-gradient-gold">
                {result.headline}
              </div>
            </div>

            <ProfileCard title="Tinder" accent="rose">
              <Field label="Bio" value={result.tinder.bio} />
              <Field label="Opener" value={result.tinder.opener} />
            </ProfileCard>

            <ProfileCard title="Hinge" accent="violet">
              {result.hinge.prompts.map((p, i) => (
                <div key={i} className="mb-3">
                  <div className="text-[11px] uppercase tracking-widest text-gold font-bold mb-1">
                    Prompt {i + 1}
                  </div>
                  <div className="text-sm font-semibold text-muted-foreground mb-1">{p.prompt}</div>
                  <CopyableBlock value={p.answer} />
                </div>
              ))}
              <Field label="Opener" value={result.hinge.opener} />
            </ProfileCard>

            <ProfileCard title="Bumble" accent="amber">
              <Field label="Bio" value={result.bumble.bio} />
              <Field label="Opener (reply to her hi)" value={result.bumble.opener} />
            </ProfileCard>

            {result.tips.length > 0 && (
              <div className="bg-card border border-gold/40 rounded-2xl p-4 md:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Flame size={16} className="text-gold" />
                  <div className="text-xs uppercase tracking-widest font-bold text-gold">
                    Level-up tips
                  </div>
                </div>
                <ul className="space-y-2 text-sm text-foreground">
                  {result.tips.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-gold">•</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-card border border-border/60 hover:border-gold/60 text-foreground font-bold px-6 py-3 rounded-xl disabled:opacity-40"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileCard({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="display text-xl">{title}</div>
        <div
          className={`text-[10px] uppercase tracking-widest font-bold ${accent === "rose" ? "text-primary" : accent === "violet" ? "text-gold" : "text-gold"}`}
        >
          Profile
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[11px] uppercase tracking-widest text-gold font-bold mb-1">{label}</div>
      <CopyableBlock value={value} />
    </div>
  );
}

function CopyableBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <div className="relative group">
      <div className="text-sm leading-relaxed bg-background border border-border/60 rounded-xl px-3 py-2.5 pr-10 whitespace-pre-wrap break-words">
        {value}
      </div>
      <button
        onClick={copy}
        aria-label="Copy to clipboard"
        className="absolute top-2 right-2 h-7 w-7 rounded-md bg-card border border-border/60 flex items-center justify-center text-muted-foreground hover:text-gold transition"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Crown, Loader2, Lock, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — RizzGod AI" },
      {
        name: "description",
        content:
          "RizzGod AI pricing: Free to start, Pro at $19/mo for unlimited practice and DM roasts, Elite at $49/mo for voice coaching.",
      },
      { property: "og:title", content: "Pricing — RizzGod AI" },
      {
        property: "og:description",
        content: "Free, Pro ($19), and Elite ($49) plans for the AI dating coach that doesn't lie.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/pricing" },
      { property: "og:type", content: "product" },
      { name: "twitter:title", content: "Pricing — RizzGod AI" },
      {
        name: "twitter:description",
        content: "Free, Pro ($19), and Elite ($49) plans for the AI dating coach that doesn't lie.",
      },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/pricing" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "RizzGod AI",
          description:
            "AI dating coach with practice chat, DM roasts, roleplays, and daily missions.",
          brand: { "@type": "Brand", name: "RizzGod AI" },
          offers: [
            {
              "@type": "Offer",
              name: "Pro",
              price: "19",
              priceCurrency: "USD",
              url: "https://rizzgod-ai.vercel.app/pricing",
              availability: "https://schema.org/InStock",
            },
            {
              "@type": "Offer",
              name: "Elite",
              price: "49",
              priceCurrency: "USD",
              url: "https://rizzgod-ai.vercel.app/pricing",
              availability: "https://schema.org/InStock",
            },
          ],
        }),
      },
    ],
  }),
  component: Pricing,
});

type PlanKey = "free" | "pro" | "elite";

const PLANS: Array<{
  key: PlanKey;
  name: string;
  price: string;
  desc: string;
  feats: string[];
  cta: string;
  highlight: boolean;
  highlightFeats?: number;
}> = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    desc: "Try the heat",
    feats: ["10 messages/day", "Practice chat", "Daily mission", "Streak tracker"],
    cta: "Current plan",
    highlight: false,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$19",
    desc: "The transformation plan",
    feats: [
      "Unlimited messages",
      "Roast My DMs",
      "Style/photo reviews",
      "Long-term memory",
      "Priority responses",
    ],
    cta: "Go Pro",
    highlight: true,
    highlightFeats: 2,
  },
  {
    key: "elite",
    name: "Elite",
    price: "$49",
    desc: "For the future high-value man",
    feats: [
      "Everything in Pro",
      "Voice motivation",
      "Advanced roleplay AI",
      "30-day transformation plan",
      "Priority access",
    ],
    cta: "Go Elite",
    highlight: false,
  },
];

function Pricing() {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | null>(null);

  async function checkout(plan: Exclude<PlanKey, "free">) {
    if (loadingPlan) return;
    setLoadingPlan(plan);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        toast.error("Sign in to upgrade.");
        window.location.assign("/auth?mode=signin");
        return;
      }
      const returnUrl = `${window.location.origin}/app?upgraded=${plan}`;
      const res = await fetch("/api/public/lemon-checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan, returnUrl }),
      });
      if (!res.ok) {
        toast.error("Could not start secure checkout. Try again.");
        return;
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) {
        toast.error("Checkout is unavailable right now. Try again in a moment.");
        return;
      }
      window.location.assign(url);
    } catch (e: unknown) {
      console.error(e);
      toast.error(errorMessage(e, "Checkout failed. Try again."));
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <main className="min-h-dvh bg-hero pl-safe pr-safe">
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-8 md:pt-12 pb-16">
        <div className="flex items-center justify-between mb-6 md:mb-8">
          <Link
            to="/"
            className="display text-2xl md:text-3xl text-gradient-blood inline-flex items-baseline gap-1"
            aria-label="RizzGod AI — Home"
          >
            RIZZGOD <span className="text-gold text-[10px] md:text-xs">AI</span>
          </Link>
          <Link
            to="/app"
            className="text-xs md:text-sm text-muted-foreground hover:text-gold transition-colors"
          >
            ← Back to app
          </Link>
        </div>

        <header className="text-center mb-8 md:mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-card/60 backdrop-blur px-3 py-1 text-[11px] font-semibold tracking-widest text-gold uppercase mb-4">
            <Sparkles size={12} aria-hidden="true" /> Cancel anytime
          </div>
          <h1 className="display text-4xl sm:text-5xl md:text-6xl leading-[1.05]">
            Pick your <span className="text-gradient-gold">upgrade</span>
          </h1>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto text-sm md:text-base">
            No bro-tax. No lock-in. Just the coach that tells you the truth — and the tools to back
            it up.
          </p>
        </header>

        <section aria-label="Plans" className="grid md:grid-cols-3 gap-4 md:gap-6 items-stretch">
          {PLANS.map((p) => {
            const isPaid = p.key !== "free";
            const isLoading = loadingPlan === p.key;
            const disabled = !isPaid || (isPaid && loadingPlan !== null);
            return (
              <article
                key={p.name}
                aria-label={`${p.name} plan`}
                className={[
                  "group relative rounded-2xl p-6 md:p-7 flex flex-col lift transition-shadow",
                  p.highlight
                    ? "bg-gradient-blood text-primary-foreground shadow-blood border border-gold/50 md:-translate-y-2 md:scale-[1.02] ring-1 ring-gold/40"
                    : "glass shadow-card border border-border/60 hover:border-gold/30",
                ].join(" ")}
              >
                {p.highlight && (
                  <>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -inset-px rounded-2xl opacity-60 [mask:linear-gradient(#000,transparent_70%)]"
                      style={{ boxShadow: "var(--glow-gold)" }}
                    />
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-gold text-gold-foreground text-[10px] font-black tracking-[0.18em] px-3 py-1 rounded-full inline-flex items-center gap-1 shadow-gold">
                      <Crown size={10} aria-hidden="true" /> MOST PICKED
                    </div>
                  </>
                )}
                <header className="mb-5">
                  <div className="flex items-baseline justify-between">
                    <h2 className="display text-xl md:text-2xl">{p.name}</h2>
                    {p.key === "elite" && (
                      <span className="text-[10px] font-bold tracking-widest text-gold uppercase">
                        Top tier
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-xs mt-1 ${p.highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    {p.desc}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="display text-5xl md:text-6xl leading-none">{p.price}</span>
                    <span
                      className={`text-sm ${p.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}
                    >
                      /mo
                    </span>
                  </div>
                </header>

                <ul className="space-y-2.5 mb-6 text-sm flex-1">
                  {p.feats.map((f, i) => {
                    const emphasize = p.highlightFeats && i < p.highlightFeats;
                    return (
                      <li key={f} className="flex gap-2.5 items-start">
                        <span
                          className={`mt-0.5 grid place-items-center h-5 w-5 rounded-full shrink-0 ${p.highlight ? "bg-gold/20 text-gold" : "bg-gold/15 text-gold"}`}
                          aria-hidden="true"
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                        <span className={emphasize ? "font-semibold" : ""}>{f}</span>
                      </li>
                    );
                  })}
                </ul>

                <button
                  type="button"
                  onClick={() => isPaid && checkout(p.key as "pro" | "elite")}
                  disabled={disabled}
                  aria-busy={isLoading}
                  aria-label={
                    isPaid ? `Upgrade to ${p.name} — ${p.price} per month` : "Current plan"
                  }
                  className={[
                    "press inline-flex items-center justify-center gap-2 w-full min-h-11 py-3 rounded-xl font-bold text-sm md:text-base",
                    "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    p.highlight
                      ? "bg-background text-foreground hover:bg-foreground hover:text-background shadow-gold"
                      : isPaid
                        ? "bg-gradient-blood text-primary-foreground shadow-blood hover:brightness-110"
                        : "bg-secondary text-secondary-foreground border border-border/60",
                  ].join(" ")}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      <span>Starting checkout…</span>
                    </>
                  ) : (
                    <span>{p.cta}</span>
                  )}
                </button>
                {!isPaid && (
                  <p className="mt-2 text-center text-[11px] text-muted-foreground">
                    You're on Free — upgrade anytime.
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <ul
          aria-label="Checkout details"
          className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto text-sm"
        >
          <li className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <ShieldCheck size={18} className="text-gold shrink-0" aria-hidden="true" />
            <span>Secure checkout by Lemon Squeezy</span>
          </li>
          <li className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <RefreshCcw size={18} className="text-gold shrink-0" aria-hidden="true" />
            <span>Cancel anytime, no questions</span>
          </li>
          <li className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Lock size={18} className="text-gold shrink-0" aria-hidden="true" />
            <span>Cards, Apple Pay & Google Pay</span>
          </li>
        </ul>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Prices in USD. Taxes calculated at checkout where applicable.
        </p>
      </div>
    </main>
  );
}

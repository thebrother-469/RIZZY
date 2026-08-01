import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
  Flame,
  MessageSquareText,
  Image as ImageIcon,
  Theater,
  Target,
  Crown,
  Check,
  ArrowRight,
  Star,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import heroImg from "@/assets/hero.jpg";
import ogImage from "@/assets/og-image.jpg.asset.json";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";

/** TanStack Router throws redirect objects; they must be rethrown, not swallowed. */
function isRouterRedirect(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const r = e as { isRedirect?: unknown; to?: unknown };
  return Boolean(r.isRedirect || r.to);
}

const SITE_URL = "https://rizzgod-ai.vercel.app";
const OG_URL = `${SITE_URL}${ogImage.url}`;

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) throw redirect({ to: "/app" });
    } catch (e: unknown) {
      // Rethrow router redirects; swallow env/config errors so the landing page still renders
      if (isRouterRedirect(e)) throw e;
      if (typeof console !== "undefined")
        console.warn("[landing] session check skipped:", errorMessage(e));
    }
  },
  head: () => ({
    meta: [
      { title: "RizzGod AI — Brutally Honest AI Dating Coach" },
      {
        name: "description",
        content:
          "RizzGod AI roasts your DMs, scores your rizz 1–10, runs date roleplays, and hands you the exact reply that gets a yes. Free to start.",
      },
      { property: "og:title", content: "RizzGod AI — Brutally Honest AI Dating Coach" },
      {
        property: "og:description",
        content:
          "RizzGod AI roasts your DMs, scores your rizz 1–10, runs date roleplays, and hands you the exact reply that gets a yes. Free to start.",
      },
      { name: "twitter:title", content: "RizzGod AI — Brutally Honest AI Dating Coach" },
      {
        name: "twitter:description",
        content:
          "RizzGod AI roasts your DMs, scores your rizz 1–10, runs date roleplays, and hands you the exact reply that gets a yes. Free to start.",
      },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_URL },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:image", content: OG_URL },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "RizzGod AI",
          description:
            "AI dating & confidence coach with practice chat, DM roasts, roleplays, and daily missions.",
          applicationCategory: "LifestyleApplication",
          operatingSystem: "Web",
          url: SITE_URL,
          image: OG_URL,
          offers: [
            { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
            { "@type": "Offer", name: "Pro", price: "19", priceCurrency: "USD" },
            { "@type": "Offer", name: "Elite", price: "49", priceCurrency: "USD" },
          ],
        }),
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [googleLoading, setGoogleLoading] = useState(false);

  const signInWithGoogle = async () => {
    setGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });

      if (error) {
        toast.error(error.message || "Sign-in failed. Try again.");
        setGoogleLoading(false);
      }
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Sign-in failed. Try again."));
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-hero text-foreground overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <div className="flex items-center gap-2">
            <span className="display text-2xl md:text-3xl text-gradient-blood">RIZZGOD</span>
            <span className="text-[10px] text-gold font-bold tracking-widest mt-1">AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="text-sm text-muted-foreground hover:text-foreground hidden sm:inline"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="text-sm font-semibold bg-gradient-blood text-primary-foreground px-4 py-2 rounded-lg shadow-blood"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="max-w-6xl mx-auto px-4 md:px-8 pt-12 md:pt-20 pb-16 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-card border border-gold/30 text-gold text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wider">
                <Flame size={14} /> The AI Wingman That Doesn't Lie
              </div>
              <h1 className="display text-5xl md:text-7xl leading-[0.95] mb-5">
                Stop simping. <br />
                <span className="text-gradient-blood">Become the man</span> <br />
                <span className="text-gradient-gold">she chases.</span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                RizzGod AI is your brutally honest dating & confidence coach. Practice flirting, get
                your DMs roasted, run real-life roleplays, and crush daily missions until you're the
                high-value man.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className="inline-flex items-center gap-2 bg-gradient-blood text-primary-foreground font-bold px-6 py-3.5 rounded-xl shadow-blood text-base"
                >
                  Start free <ArrowRight size={18} />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 bg-card border border-border text-foreground font-semibold px-6 py-3.5 rounded-xl"
                >
                  See the plans
                </Link>
              </div>
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={googleLoading}
                className="mt-4 inline-flex items-center gap-3 bg-black text-white font-semibold px-6 py-3.5 rounded-xl border border-white/15 hover:bg-black/80 hover:border-white/25 disabled:opacity-50 transition"
              >
                {googleLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                    <path
                      fill="#FFC107"
                      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
                    />
                    <path
                      fill="#FF3D00"
                      d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
                    />
                    <path
                      fill="#4CAF50"
                      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
                    />
                    <path
                      fill="#1976D2"
                      d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41 34.4 44 29.6 44 24c0-1.3-.1-2.4-.4-3.5z"
                    />
                  </svg>
                )}
                Continue with Google
              </button>
              <div className="flex items-center gap-4 mt-6 text-xs text-muted-foreground">
                <div className="flex">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} size={14} className="text-gold fill-gold" />
                  ))}
                </div>
                <span>Built by men, for men who are done losing.</span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-blood opacity-30 blur-3xl rounded-full" />
              <img
                src={heroImg}
                alt="High value man silhouette"
                width={1536}
                height={1024}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="relative rounded-2xl shadow-blood border border-gold/20"
              />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl mx-auto px-4 md:px-8 py-16">
          <h2 className="display text-4xl md:text-5xl text-center mb-3">
            Everything you need to <span className="text-gradient-gold">level up</span>
          </h2>
          <p className="text-center text-muted-foreground mb-12 max-w-xl mx-auto">
            No fluff. Just real practice, real feedback, real results with real women.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: MessageSquareText,
                title: "Live Practice Chat",
                desc: "Drop any line. Get an instant 1-10 score, brutal honest feedback, and 3 elite rewrites.",
              },
              {
                icon: ImageIcon,
                title: "Roast My DMs",
                desc: "Upload your screenshots. Get savagely roasted, then handed the exact reply that gets a yes.",
              },
              {
                icon: Theater,
                title: "Roleplay Real Dates",
                desc: "First date, bar meet, late-night text — practice the real thing without losing real opportunities.",
              },
              {
                icon: Flame,
                title: "Style & Looks Review",
                desc: "Upload outfit/profile pics. Get an honest stylist breakdown and 3 upgrades you can do today.",
              },
              {
                icon: Target,
                title: "Daily Missions",
                desc: "One real-world challenge per day that forces you to take action. That's how confidence is built.",
              },
              {
                icon: Crown,
                title: "Long-term Memory",
                desc: "Coach remembers your goals, wins, and weak spots. Your transformation, tracked.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-card/60 backdrop-blur border border-border/60 rounded-2xl p-6 shadow-card hover:border-gold/40 transition"
              >
                <div className="h-11 w-11 rounded-xl bg-gradient-blood flex items-center justify-center text-primary-foreground mb-4 shadow-blood">
                  <f.icon size={20} />
                </div>
                <h3 className="font-bold text-lg mb-1.5">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Proof */}
        <section className="bg-card/40 border-y border-border/60 py-16">
          <div className="max-w-5xl mx-auto px-4 md:px-8">
            <h2 className="display text-3xl md:text-4xl text-center mb-10">
              From <span className="text-gradient-blood">simp</span> to{" "}
              <span className="text-gradient-gold">savage</span> in 30 days
            </h2>
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  q: "I went from getting left on read every week to having two dates next weekend. The roast mode is unreal.",
                  n: "Marcus, 24",
                },
                {
                  q: "RizzGod called me a simp for paragraphs I sent. He was right. Fixed it. She replied in 4 min.",
                  n: "Devon, 28",
                },
                {
                  q: "The daily missions broke my approach anxiety. Talked to 5 women this week. Five.",
                  n: "Jay, 31",
                },
              ].map((t) => (
                <div key={t.n} className="bg-background border border-border/60 rounded-2xl p-6">
                  <div className="flex mb-3">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} size={14} className="text-gold fill-gold" />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed mb-3">"{t.q}"</p>
                  <div className="text-xs text-gold font-bold uppercase tracking-wider">
                    — {t.n}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-16">
          <h2 className="display text-4xl md:text-5xl text-center mb-3">
            Pick your <span className="text-gradient-gold">grind</span>
          </h2>
          <p className="text-center text-muted-foreground mb-10">
            Free forever to taste it. Pro & Elite for the ones who actually want results.
          </p>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                name: "Free",
                price: "$0",
                desc: "Try the heat",
                feats: ["10 messages/day", "Practice chat", "Daily mission", "Streak tracker"],
                cta: "Start free",
                highlight: false,
              },
              {
                name: "Pro",
                price: "$19",
                desc: "The transformation plan",
                feats: [
                  "Unlimited everything",
                  "Roast My DMs",
                  "Style/photo reviews",
                  "Long-term memory",
                  "Priority responses",
                ],
                cta: "Go Pro",
                highlight: true,
              },
              {
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
            ].map((p) => (
              <div
                key={p.name}
                className={`relative rounded-2xl p-6 ${p.highlight ? "bg-gradient-blood text-primary-foreground shadow-blood border border-gold/40" : "bg-card border border-border/60"}`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold text-gold-foreground text-[10px] font-black tracking-widest px-3 py-1 rounded-full">
                    MOST PICKED
                  </div>
                )}
                <div className="display text-xl mb-1">{p.name}</div>
                <div className="display text-4xl mb-1">
                  {p.price}
                  <span className="text-base opacity-70">/mo</span>
                </div>
                <div className="text-xs opacity-80 mb-4">{p.desc}</div>
                <ul className="space-y-2 mb-6 text-sm">
                  {p.feats.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={16} className={p.highlight ? "text-gold" : "text-gold"} /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/pricing"
                  className={`block text-center py-2.5 rounded-lg font-bold ${p.highlight ? "bg-background text-foreground" : "bg-gradient-blood text-primary-foreground"}`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <div className="display text-xl text-gradient-blood mb-2">RIZZGOD AI</div>
        <div className="flex justify-center items-center gap-4 mb-4">
          <a
            href="https://www.instagram.com/rizzgod_ai?igsh=MWVjYWI3Z2cxbXJkNQ=="
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            title="Instagram"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
            </svg>
          </a>
          <a
            href="https://vt.tiktok.com/ZSXN8Qp3B/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="TikTok"
            title="TikTok"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-hidden="true"
            >
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
            </svg>
          </a>
          <a
            href="https://www.facebook.com/share/1BY8cws9dX/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Facebook"
            title="Facebook"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v10h4V14h3.5l.5-4H14V7a1 1 0 0 1 1-1h3z" />
            </svg>
          </a>
          <a
            href="https://x.com/RizzappAI"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Twitter"
            title="Twitter"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53A4.48 4.48 0 0 0 22.4.36a9 9 0 0 1-2.86 1.1A4.52 4.52 0 0 0 16.11 0c-2.5 0-4.5 2.04-4.5 4.55 0 .36.04.71.12 1.05A12.94 12.94 0 0 1 1.64 1.14a4.48 4.48 0 0 0-.61 2.29 4.54 4.54 0 0 0 2 3.78 4.47 4.47 0 0 1-2.04-.57v.06c0 2.26 1.6 4.15 3.73 4.58a4.52 4.52 0 0 1-2.03.08 4.55 4.55 0 0 0 4.24 3.16A9.06 9.06 0 0 1 1 19.55a12.76 12.76 0 0 0 6.92 2.03c8.3 0 12.84-6.86 12.84-12.82 0-.2 0-.41-.01-.61A9.22 9.22 0 0 0 23 3z" />
            </svg>
          </a>
        </div>
        <p>
          © {new Date().getFullYear()} — Built for the man who's done losing. Be respectful. Be
          sharp. Win.
        </p>
      </footer>
    </div>
  );
}

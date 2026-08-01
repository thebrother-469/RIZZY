import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Check, X, ArrowRight, Sparkles, Target, MessageSquareText } from "lucide-react";

const SITE_URL = "https://rizzgod-ai.vercel.app";
const PAGE_URL = `${SITE_URL}/ai-dating-guide`;

const TITLE = "AI Dating Coach Guide: Honest vs. Traditional (2026)";
const DESCRIPTION =
  "A 2026 guide comparing brutally honest AI coaching like RizzGod AI against traditional dating advice and generic chatbots.";

type Row = { feature: string; rizzgod: string; genericAI: string; traditional: string };

const COMPARISON: Row[] = [
  {
    feature: "Feedback style",
    rizzgod: "Brutally honest, no sugar-coating",
    genericAI: "Polite, hedged, safe",
    traditional: "Depends on the coach — often generic",
  },
  {
    feature: "Rewrites your actual DMs",
    rizzgod: "Yes — paste a convo, get elite rewrites",
    genericAI: "Sometimes, watered down",
    traditional: "Rarely, and slow",
  },
  {
    feature: "Live roleplay dates",
    rizzgod: "Yes — practice with distinct personas",
    genericAI: "No",
    traditional: "No",
  },
  {
    feature: "Daily missions",
    rizzgod: "Real-world action, gamified with XP",
    genericAI: "No",
    traditional: "Homework, no accountability",
  },
  {
    feature: "Response speed",
    rizzgod: "Instant, 24/7",
    genericAI: "Instant, 24/7",
    traditional: "Days to weeks",
  },
  {
    feature: "Cost",
    rizzgod: "Free tier + affordable Pro",
    genericAI: "Free or ChatGPT Plus",
    traditional: "$100–$500+ per session",
  },
  {
    feature: "Remembers you",
    rizzgod: "Yes — long-term memory of your style",
    genericAI: "Session-only",
    traditional: "Depends on the coach",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is an AI dating coach?",
    a: "An AI dating coach is a tool that analyzes your messages, profile, and dating strategy in real time — then gives feedback, rewrites, and practice reps. Unlike a human coach, it's available 24/7 and costs a fraction of the price. The best ones remember your style and adapt as you improve.",
  },
  {
    q: "Is AI dating advice actually better than a human coach?",
    a: "For most people, yes — for speed, honesty, and reps. AI never gets tired of your 47th opener, doesn't judge, and gives feedback in seconds. Human coaches still win for deep psychological work, but for day-to-day DM game and profile tuning, AI wins on volume and cost.",
  },
  {
    q: "Why 'brutally honest' instead of a polite chatbot?",
    a: "Polite AI tells you what you want to hear. That doesn't move the needle. RizzGod AI scores every line 1–10, explains exactly why it's mid, and rewrites it into something elite. You improve because you can't hide from the score.",
  },
  {
    q: "Does using AI make dating feel less authentic?",
    a: "It's a training tool, not a script. Nobody says using a gym coach makes you less authentic — same logic. You use AI to build the reps and taste, then you send your own lines. The confidence is real; the AI just accelerates the learning curve.",
  },
  {
    q: "How much does RizzGod AI cost?",
    a: "There's a free tier so you can test it before paying. Pro unlocks unlimited practice reps, roleplay, DM roasting, and long-term memory. See the pricing page for current plans.",
  },
];

export const Route = createFileRoute("/ai-dating-guide")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "ai dating, ai dating coach, ai dating app, ai flirting coach, ai wingman, best ai dating coach, brutally honest ai dating coach",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          url: PAGE_URL,
          author: { "@type": "Organization", name: "RizzGod AI" },
          publisher: { "@type": "Organization", name: "RizzGod AI", url: SITE_URL },
          datePublished: "2026-07-08",
          dateModified: "2026-07-08",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: AiDatingGuide,
});

function AiDatingGuide() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60 sticky top-0 z-40 bg-background/90 backdrop-blur">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Flame className="text-primary" size={20} /> RizzGod AI
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="bg-gradient-blood text-primary-foreground font-bold px-4 py-2 rounded-lg text-sm shadow-blood"
          >
            Start free
          </Link>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 py-10 md:py-16 space-y-12">
        <section>
          <div className="text-xs text-gold uppercase tracking-widest font-bold mb-2">
            Guide · Updated July 2026
          </div>
          <h1 className="display text-4xl md:text-6xl leading-tight mb-4">
            AI Dating Coach Guide:{" "}
            <span className="text-gradient-blood">Brutally Honest vs. Polite</span>
          </h1>
          <p className="text-lg text-muted-foreground">
            AI is quietly eating dating advice. This guide compares brutally honest AI dating
            coaches (like RizzGod AI) against generic AI chatbots and traditional human coaches — so
            you know which one actually gets you replies.
          </p>
        </section>

        <section aria-labelledby="tldr">
          <h2 id="tldr" className="display text-2xl md:text-3xl mb-3">
            TL;DR
          </h2>
          <ul className="space-y-2 text-base">
            <li className="flex gap-2">
              <Check className="text-success shrink-0 mt-1" size={18} /> If you want honest feedback
              on real DMs, use a specialized AI dating coach.
            </li>
            <li className="flex gap-2">
              <Check className="text-success shrink-0 mt-1" size={18} /> Generic chatbots (ChatGPT,
              Gemini) are polite and hedged — fine for ideas, weak for coaching.
            </li>
            <li className="flex gap-2">
              <Check className="text-success shrink-0 mt-1" size={18} /> Human coaches are best for
              deep confidence work, but slow and expensive for daily reps.
            </li>
            <li className="flex gap-2">
              <Check className="text-success shrink-0 mt-1" size={18} /> RizzGod AI is built for the
              DM game: scores every line 1–10, rewrites it, and gives you daily missions.
            </li>
          </ul>
        </section>

        <section aria-labelledby="what-is">
          <h2 id="what-is" className="display text-2xl md:text-3xl mb-3">
            What is an AI dating coach?
          </h2>
          <p className="text-muted-foreground mb-3">
            An AI dating coach is a tool that reviews your messages, profile, and dating strategy —
            then tells you what's working, what's not, and how to fix it. The best ones do three
            things:
          </p>
          <ul className="space-y-2 text-base">
            <li className="flex gap-2">
              <ArrowRight className="text-gold shrink-0 mt-1" size={18} /> Score your actual lines
              against a clear standard, not vibes.
            </li>
            <li className="flex gap-2">
              <ArrowRight className="text-gold shrink-0 mt-1" size={18} /> Rewrite weak messages
              into ones that hit.
            </li>
            <li className="flex gap-2">
              <ArrowRight className="text-gold shrink-0 mt-1" size={18} /> Give you reps — practice
              conversations you can't get from a text guide.
            </li>
          </ul>
        </section>

        <section aria-labelledby="compare">
          <h2 id="compare" className="display text-2xl md:text-3xl mb-4">
            RizzGod AI vs. generic AI vs. human coaches
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60">
                <tr>
                  <th className="text-left p-3 font-bold">Feature</th>
                  <th className="text-left p-3 font-bold text-primary">RizzGod AI</th>
                  <th className="text-left p-3 font-bold">Generic AI (ChatGPT etc.)</th>
                  <th className="text-left p-3 font-bold">Traditional coach</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((r, i) => (
                  <tr key={r.feature} className={i % 2 ? "bg-card/40" : ""}>
                    <td className="p-3 font-semibold">{r.feature}</td>
                    <td className="p-3 text-foreground">{r.rizzgod}</td>
                    <td className="p-3 text-muted-foreground">{r.genericAI}</td>
                    <td className="p-3 text-muted-foreground">{r.traditional}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="honest">
          <h2 id="honest" className="display text-2xl md:text-3xl mb-3">
            Why brutally honest beats polite
          </h2>
          <p className="text-muted-foreground mb-3">
            Most AI chatbots are trained to be agreeable. If you send them a mid opener, they'll pat
            you on the back and suggest a small tweak. That feels good and changes nothing.
          </p>
          <p className="text-muted-foreground mb-3">
            A brutally honest AI dating coach does the opposite. It tells you your line is a 4/10,
            explains exactly why (too safe, no hook, boring question), and rewrites it into
            something specific enough to earn a reply. You leave every session slightly humbled and
            noticeably better.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="border border-destructive/40 bg-destructive/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm mb-2">
                <X size={16} /> Polite AI
              </div>
              <p className="text-sm">
                "Nice opener! Maybe add a question at the end to keep the conversation going."
              </p>
            </div>
            <div className="border border-primary/40 bg-primary/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-primary font-bold text-sm mb-2">
                <Flame size={16} /> Brutally honest AI
              </div>
              <p className="text-sm">
                "3/10. 'Hey how's your week?' is a coward move. Try:{" "}
                <em>'Your book stack in pic 2 is dangerous — which one wrecked you the most?'</em>"
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="when">
          <h2 id="when" className="display text-2xl md:text-3xl mb-3">
            When to use AI vs. a human coach
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-border/60 rounded-xl p-5">
              <div className="text-xs text-gold uppercase tracking-widest font-bold mb-2">
                Use AI for
              </div>
              <ul className="space-y-2 text-sm">
                <li>• Daily DM feedback and rewrites</li>
                <li>• Profile and photo picks</li>
                <li>• Practice roleplay before a first date</li>
                <li>• Building reps fast, on a budget</li>
              </ul>
            </div>
            <div className="border border-border/60 rounded-xl p-5">
              <div className="text-xs text-gold uppercase tracking-widest font-bold mb-2">
                Use a human coach for
              </div>
              <ul className="space-y-2 text-sm">
                <li>• Deep confidence or anxiety work</li>
                <li>• Long-term relationship coaching</li>
                <li>• Accountability with real check-ins</li>
                <li>• You've plateaued and need eyes on your patterns</li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className="display text-2xl md:text-3xl mb-4">
            FAQ
          </h2>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <details key={f.q} className="border border-border/60 rounded-xl p-4 group">
                <summary className="font-bold cursor-pointer list-none flex items-center justify-between gap-3">
                  {f.q}
                  <span className="text-gold group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-muted-foreground text-sm">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-card border border-gold/40 rounded-2xl p-6 md:p-8 relative overflow-hidden">
          <div className="absolute -top-16 -right-16 h-48 w-48 bg-gradient-blood opacity-15 blur-3xl rounded-full" />
          <div className="text-xs text-gold uppercase tracking-widest font-bold mb-2">
            Try it free
          </div>
          <h2 className="display text-3xl md:text-4xl mb-3">Stop guessing. Get the score.</h2>
          <p className="text-muted-foreground mb-5 max-w-xl">
            Drop your next line into RizzGod AI. Get a 1–10 score, the reason it's mid, and an elite
            rewrite in seconds. Free to start.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="bg-gradient-blood text-primary-foreground font-bold px-5 py-3 rounded-lg shadow-blood inline-flex items-center gap-2"
            >
              <Sparkles size={18} /> Start free
            </Link>
            <Link
              to="/hinge-openers"
              className="border border-border/80 font-semibold px-5 py-3 rounded-lg inline-flex items-center gap-2"
            >
              <MessageSquareText size={18} /> See Hinge openers
            </Link>
            <Link
              to="/pricing"
              className="border border-border/80 font-semibold px-5 py-3 rounded-lg inline-flex items-center gap-2"
            >
              <Target size={18} /> View pricing
            </Link>
          </div>
        </section>
      </article>

      <footer className="border-t border-border/60 py-8 mt-8">
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap gap-4 justify-between text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} RizzGod AI</div>
          <div className="flex gap-4">
            <Link to="/pricing">Pricing</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

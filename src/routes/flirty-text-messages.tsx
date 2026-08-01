import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, ArrowRight, MessageSquareText, Sparkles } from "lucide-react";

const SITE_URL = "https://rizzgod-ai.vercel.app";
const PAGE_URL = `${SITE_URL}/flirty-text-messages`;

const TITLE = "100+ Flirty Text Messages That Actually Work (2026)";
const DESCRIPTION =
  "Copy-paste flirty text messages for every stage — first message, follow-up, teasing, late-night. From RizzGod AI, the brutally honest dating coach.";

type Msg = { line: string; why: string };

const CATEGORIES: { title: string; blurb: string; messages: Msg[] }[] = [
  {
    title: "First message — break the ice without begging",
    blurb:
      "No 'hey' or 'how's your day.' Reference something specific, add a hook, invite a reply.",
    messages: [
      {
        line: "Okay your bookshelf pic is dangerous — one of those is a red flag. I'll let you guess which.",
        why: "Playful accusation, forces a reply.",
      },
      {
        line: "You look like trouble in the best way. What's the wildest thing you've done this month?",
        why: "Confident frame + open question.",
      },
      {
        line: "Serious question — are you a 'texts back in 3 minutes' person or a 'ghost for 6 hours then send a paragraph' person?",
        why: "Teases her texting habits, invites self-reveal.",
      },
      {
        line: "I refuse to send a boring opener. So: coffee, cocktails, or a truly unhinged first-date suggestion?",
        why: "Skips small talk, moves toward a plan.",
      },
    ],
  },
  {
    title: "Follow-up — keep the momentum after she replies",
    blurb: "Match her energy. Build on what she said instead of restarting the conversation.",
    messages: [
      {
        line: "See, now that's a story. What made you actually go through with it?",
        why: "Rewards the story, digs one level deeper.",
      },
      {
        line: "Noted. Filing that under 'things I'll bring up on the date I'm about to suggest.'",
        why: "Playful callback + soft date pull.",
      },
      {
        line: "Okay you're way more interesting than your prompts made you look. Congrats — you're upgraded.",
        why: "Confident tease, positions you as the prize.",
      },
      {
        line: "I have a theory about you already. It's either flattering or terrifying — pick which one you want to hear.",
        why: "Curiosity hook, she can't leave it on read.",
      },
    ],
  },
  {
    title: "Playful teasing — build tension without being mean",
    blurb: "The line between fun and rude is real. Tease the vibe, never the person.",
    messages: [
      {
        line: "You're trouble. I can already tell. This is a warning to myself, not a compliment.",
        why: "Frames her as the exciting one, keeps you unattainable.",
      },
      {
        line: "Wow, opinions AND spelling. I might be in danger.",
        why: "Backhanded compliment that reads as flirty, not harsh.",
      },
      {
        line: "I was going to say something charming but you'd probably use it against me. Try me anyway.",
        why: "Vulnerable-but-playful, invites her to push.",
      },
      {
        line: "You keep sending me energy like this and I'm going to have to actually take you out. Reckless behavior.",
        why: "Escalates toward a date with a smile.",
      },
    ],
  },
  {
    title: "Late-night — sharp, warm, never desperate",
    blurb:
      "Late texts read as either confident or thirsty. The difference is what you're asking for.",
    messages: [
      {
        line: "It's late and I'm being an adult about it — but if you're up, tell me one thing that made you laugh today.",
        why: "Warm, specific, low-pressure.",
      },
      {
        line: "You crossed my mind. That's it. That's the text.",
        why: "Direct, confident, no ask.",
      },
      {
        line: "If I asked you to grab a drink tomorrow, would you say yes, or would you make me work for it?",
        why: "Skips ambiguity, invites her to play.",
      },
    ],
  },
  {
    title: "Bring it back after she goes cold",
    blurb: "Don't double-text with 'you there?' Reset the vibe with something she has to answer.",
    messages: [
      {
        line: "Okay confession — I was overthinking what to send you. So I'm just going with this instead. How's your week actually going?",
        why: "Honest, warm, restarts without pressure.",
      },
      {
        line: "You disappeared. Rude. I'll forgive you if you tell me the best thing you did this week.",
        why: "Playful call-out + easy question to answer.",
      },
      {
        line: "Give me one word to describe your last 48 hours. I'll build a whole story off it.",
        why: "Low-effort ask, high-effort reward.",
      },
    ],
  },
];

const RULES = [
  "Reference something specific. Generic = deletable.",
  "Every message ends with a hook — a question, a challenge, or a plan.",
  "Match her energy. If she sends one line, don't send four.",
  "Confidence beats cleverness. Say less, mean more.",
  "Never explain why the joke was funny. Never apologize for sending it.",
];

export const Route = createFileRoute("/flirty-text-messages")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
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
          author: { "@type": "Organization", name: "RizzGod AI" },
          publisher: { "@type": "Organization", name: "RizzGod AI" },
          mainEntityOfPage: PAGE_URL,
        }),
      },
    ],
  }),
  component: FlirtyTextMessages,
});

function FlirtyTextMessages() {
  return (
    <main className="min-h-dvh bg-hero text-foreground">
      <nav className="sticky top-0 z-50 bg-background/70 backdrop-blur border-b border-border/40">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="display text-2xl text-gradient-blood">RIZZGOD</span>
            <span className="text-[10px] text-gold font-bold tracking-widest mt-1">AI</span>
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="text-sm font-semibold bg-gradient-blood text-primary-foreground px-4 py-2 rounded-lg shadow-blood"
          >
            Get personal lines
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 md:px-8 pt-12 pb-20">
        <div className="inline-flex items-center gap-2 bg-card border border-gold/30 text-gold text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wider">
          <Flame size={14} /> Flirty texts, no cringe
        </div>
        <h1 className="display text-4xl md:text-6xl leading-[1] mb-5">
          100+ flirty text messages that{" "}
          <span className="text-gradient-blood">actually get replies</span>
        </h1>
        <p className="text-lg text-muted-foreground mb-10">
          Copy-paste lines for every stage of the conversation — first message, follow-up, playful
          teasing, late-night, and revival texts. Every line is here for a reason, and every line
          has a "why" so you can write your own.
        </p>

        <div className="bg-card/60 border border-gold/30 rounded-2xl p-6 mb-12">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-gold" />
            <h2 className="display text-xl">The 5 rules that make any line hit</h2>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {RULES.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-gold">•</span> {r}
              </li>
            ))}
          </ul>
        </div>

        {CATEGORIES.map((cat) => (
          <section key={cat.title} className="mb-12">
            <h2 className="display text-2xl md:text-3xl mb-2">{cat.title}</h2>
            <p className="text-sm text-muted-foreground mb-5">{cat.blurb}</p>
            <div className="space-y-3">
              {cat.messages.map((m) => (
                <div key={m.line} className="bg-card border border-border/60 rounded-xl p-5">
                  <div className="flex items-start gap-3 mb-2">
                    <MessageSquareText size={16} className="text-gold mt-1 shrink-0" />
                    <p className="font-semibold leading-snug">"{m.line}"</p>
                  </div>
                  <p className="text-xs text-muted-foreground pl-7">Why it works: {m.why}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="bg-gradient-blood text-primary-foreground rounded-2xl p-8 text-center shadow-blood">
          <h2 className="display text-3xl mb-2">Want lines written for HER, not the internet?</h2>
          <p className="opacity-90 mb-5">
            Drop her profile or your last DM into RizzGod AI. Get 3 elite rewrites in seconds, tuned
            to her vibe.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-background text-foreground font-bold px-6 py-3 rounded-xl"
          >
            Start free <ArrowRight size={18} />
          </Link>
        </div>
      </article>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <div className="display text-xl text-gradient-blood mb-2">RIZZGOD AI</div>
        <p>© {new Date().getFullYear()} — Built for the man who's done losing.</p>
      </footer>
    </main>
  );
}

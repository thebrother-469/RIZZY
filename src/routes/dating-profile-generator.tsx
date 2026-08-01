import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, ArrowRight, Sparkles, Target, MessageSquareText } from "lucide-react";

const SITE_URL = "https://rizzgod-ai.vercel.app";
const PAGE_URL = `${SITE_URL}/dating-profile-generator`;

const TITLE = "AI Dating Profile Generator — Hinge, Tinder & Bumble";
const DESCRIPTION =
  "Free AI dating profile generator. Write bios, prompts, and openers for Hinge, Tinder, and Bumble that actually get matches. By RizzGod AI.";

type Sample = { app: "Hinge" | "Tinder" | "Bumble"; vibe: string; bio: string };

const SAMPLES: Sample[] = [
  {
    app: "Hinge",
    vibe: "Confident, understated",
    bio: "Two truths: I'll out-cook your favorite chef and I've never lost a game of pool. The lie: I'll admit which one is which on the first date.",
  },
  {
    app: "Tinder",
    vibe: "Playful, direct",
    bio: "Engineer by day, terrible-movie critic by night. Swipe right if you can name a red flag in a rom-com. Best date I plan: espresso + a walk that turns into dinner.",
  },
  {
    app: "Bumble",
    vibe: "Warm, ambitious",
    bio: "Building a company, running half-marathons badly, and collecting neighborhood coffee spots. Looking for someone who has strong opinions on breakfast tacos.",
  },
];

const PROMPT_ANSWERS = [
  {
    prompt: "The way to win me over is…",
    answer: "Have a plan B for the date. Nothing hotter than 'the place is closed, follow me.'",
  },
  {
    prompt: "A shower thought I recently had",
    answer: "The person who invented the snooze button owes me at least three years of my life.",
  },
  {
    prompt: "My most controversial opinion",
    answer: "Pineapple belongs on pizza. Come argue with me — I'll buy the first slice.",
  },
  {
    prompt: "I'm weirdly attracted to",
    answer: "People who over-explain the plot of a show they love. Please, keep going.",
  },
];

const STEPS = [
  {
    n: "1",
    t: "Tell it about you",
    d: "Age, job, 2–3 hobbies, one weird detail, and the vibe you want (confident, funny, warm).",
  },
  {
    n: "2",
    t: "Pick your app",
    d: "Hinge, Tinder, or Bumble — the generator adapts length and format to each platform.",
  },
  {
    n: "3",
    t: "Get a full profile",
    d: "Bio, 3 prompt answers, 3 opening lines, and a photo checklist — all in seconds.",
  },
];

const AVOID = [
  "'Just ask' — you're not giving her anything to work with.",
  "'I love to travel' — so does every profile she's seen this week.",
  "Lists of adjectives ('funny, kind, adventurous') — show, don't tell.",
  "Fake humility ('probably not your type') — reads as insecure.",
  "Emojis stacked five deep — one is a seasoning, five is a crime.",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is an AI dating profile generator?",
    a: "An AI dating profile generator writes your bio, prompt answers, and opening lines based on a few facts about you. RizzGod AI's version is tuned specifically for Hinge, Tinder, and Bumble — it matches each app's format and tone instead of pasting the same paragraph everywhere.",
  },
  {
    q: "Is the RizzGod AI dating profile generator free?",
    a: "Yes. You can generate a full bio, three prompt answers, and three openers on the free plan. Pro unlocks unlimited regenerations, photo scoring, and screenshot-based feedback.",
  },
  {
    q: "Will an AI-written dating bio sound fake?",
    a: "Only if you paste it word-for-word without editing. Treat the output as a first draft that already avoids the boring clichés — then swap in one or two of your actual quirks and you'll sound sharper than 95% of profiles.",
  },
  {
    q: "Does it work for Hinge, Tinder, and Bumble?",
    a: "Yes. Hinge profiles get short prompt-style answers, Tinder gets a punchy 2–3 line bio, Bumble gets a warmer intro with a clear ask. Same input, three tailored outputs.",
  },
  {
    q: "Can it also write openers for the people I match with?",
    a: "Yes. Once your profile is live, upload a screenshot of hers and RizzGod AI will roast it, score it, and hand you three custom openers plus the follow-up if she replies.",
  },
];

export const Route = createFileRoute("/dating-profile-generator")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "ai dating profile generator, dating bio generator, hinge bio generator, tinder bio generator, bumble bio generator, ai dating bio, dating profile writer",
      },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: PAGE_URL },
      { property: "og:type", content: "article" },
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
          publisher: {
            "@type": "Organization",
            name: "RizzGod AI",
            logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
          },
          mainEntityOfPage: PAGE_URL,
          datePublished: "2026-07-09",
          dateModified: "2026-07-09",
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            {
              "@type": "ListItem",
              position: 2,
              name: "AI Dating Profile Generator",
              item: PAGE_URL,
            },
          ],
        }),
      },
    ],
  }),
  component: DatingProfileGeneratorPage,
});

function DatingProfileGeneratorPage() {
  return (
    <main className="min-h-dvh bg-hero text-foreground">
      <nav className="sticky top-0 z-40 bg-background/70 backdrop-blur border-b border-border/40">
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
            Generate my profile
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="inline-flex items-center gap-2 bg-card border border-gold/30 text-gold text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wider">
          <Flame size={14} /> Free · Hinge · Tinder · Bumble
        </div>
        <h1 className="display text-4xl md:text-6xl leading-[1.05] mb-5">
          The <span className="text-gradient-blood">AI dating profile generator</span> that stops
          writing you like everyone else
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Feed it a few honest details. Get a bio, three prompt answers, and three openers tailored
          to Hinge, Tinder, or Bumble — with zero "I love to travel" energy.
        </p>

        <div className="flex flex-wrap gap-3 mb-12">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-gradient-blood text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-blood"
          >
            <Sparkles size={18} /> Generate my dating profile free
          </Link>
          <a
            href="#samples"
            className="inline-flex items-center gap-2 bg-card border border-border text-foreground font-semibold px-6 py-3 rounded-xl"
          >
            See sample profiles <ArrowRight size={16} />
          </a>
        </div>

        <section className="grid gap-4 md:grid-cols-3 mb-14">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-card/60 border border-border/60 rounded-2xl p-5">
              <div className="h-9 w-9 rounded-lg bg-gradient-gold text-gold-foreground font-black flex items-center justify-center mb-3">
                {s.n}
              </div>
              <h2 className="display text-lg mb-1">{s.t}</h2>
              <p className="text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </section>

        <section id="samples" className="mb-14">
          <h2 className="display text-3xl md:text-4xl mb-2">
            Sample bios by <span className="text-gradient-gold">app</span>
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Same person, three tones — Hinge, Tinder, Bumble.
          </p>
          <div className="grid gap-4">
            {SAMPLES.map((s) => (
              <div key={s.app} className="bg-card/60 border border-border/60 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-widest font-bold">
                  <span className="text-gold">{s.app}</span>
                  <span className="text-muted-foreground">· {s.vibe}</span>
                </div>
                <p className="text-base leading-relaxed">{s.bio}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-14">
          <h2 className="display text-3xl md:text-4xl mb-2">
            Prompt answers that <span className="text-gradient-blood">actually work</span>
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Copy the structure — a specific detail + a small invitation to reply.
          </p>
          <div className="grid gap-3">
            {PROMPT_ANSWERS.map((p) => (
              <div key={p.prompt} className="bg-card/60 border border-border/60 rounded-2xl p-5">
                <div className="text-xs text-gold uppercase tracking-widest font-bold mb-2">
                  "{p.prompt}"
                </div>
                <p className="text-base leading-relaxed">{p.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-14 bg-card/60 border border-primary/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-primary" />
            <h2 className="display text-2xl">
              Bio patterns to <span className="text-gradient-blood">never</span> use
            </h2>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {AVOID.map((a) => (
              <li key={a} className="flex gap-2">
                <span className="text-primary">✗</span>
                {a}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-14 bg-gradient-blood text-primary-foreground rounded-2xl p-8 text-center shadow-blood">
          <MessageSquareText size={32} className="mx-auto mb-3" />
          <h2 className="display text-3xl md:text-4xl mb-3">
            Generate your full profile in 30 seconds
          </h2>
          <p className="text-sm md:text-base opacity-90 mb-6 max-w-lg mx-auto">
            Bio, prompt answers, openers, photo checklist — tuned to the app you're on. Free to
            start, no credit card.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-background text-foreground font-bold px-6 py-3.5 rounded-xl"
          >
            Start free <ArrowRight size={18} />
          </Link>
        </section>

        <section className="mb-14">
          <h2 className="display text-3xl md:text-4xl mb-6">AI dating profile generator — FAQ</h2>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <details
                key={f.q}
                className="bg-card/60 border border-border/60 rounded-xl p-5 group"
              >
                <summary className="font-semibold cursor-pointer list-none flex justify-between items-center">
                  {f.q}
                  <span className="text-gold group-open:rotate-45 transition-transform text-xl leading-none">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="mt-16 pt-8 border-t border-border/60 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Written by the team behind{" "}
            <Link to="/" className="text-gold hover:underline">
              RizzGod AI
            </Link>{" "}
            — the brutally honest AI dating coach.
          </p>
          <p className="text-xs text-muted-foreground">
            More tools:{" "}
            <Link to="/hinge-openers" className="text-gold hover:underline">
              Hinge openers
            </Link>{" "}
            ·{" "}
            <Link to="/tinder-openers" className="text-gold hover:underline">
              Tinder openers
            </Link>{" "}
            ·{" "}
            <Link to="/flirty-text-messages" className="text-gold hover:underline">
              Flirty texts
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

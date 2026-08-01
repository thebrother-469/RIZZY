import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, ArrowRight, Sparkles, MessageSquareText, Target } from "lucide-react";

const SITE_URL = "https://rizzgod-ai.vercel.app";
const PAGE_URL = `${SITE_URL}/tinder-openers`;

const TITLE = "60+ Best Tinder Openers & Response Strategies (2026)";
const DESCRIPTION =
  "The best Tinder openers and reply strategies for 2026 — copy-paste lines for every bio, photo, and vibe. From RizzGod AI, the brutally honest AI Tinder helper.";

type Opener = { line: string; why: string };

const BIO_OPENERS: { bio: string; openers: Opener[] }[] = [
  {
    bio: "Short bio / one-liner",
    openers: [
      {
        line: "A one-liner bio is a power move or a red flag. I'm giving you the benefit of the doubt — prove me right.",
        why: "Playful challenge, invites her to actually reply with substance.",
      },
      {
        line: "Bold to give me nothing to work with. Okay — pitch yourself in three words.",
        why: "Turns the emptiness into a game she has to win.",
      },
    ],
  },
  {
    bio: "Emoji-only bio",
    openers: [
      {
        line: "I'm going to read your emojis like tea leaves and get everything wrong. Ready?",
        why: "Turns lack of info into fun, keeps you unbothered.",
      },
      {
        line: "Translate: 🌵🍸✈️ — is this a vibe, a plan, or a warning?",
        why: "Reacts to her actual emojis, invites a mini story.",
      },
    ],
  },
  {
    bio: "Adventurous / travel bio",
    openers: [
      {
        line: "'Loves to travel' is on 90% of profiles. Sell me the trip you'd actually book tomorrow.",
        why: "Calls out the cliché, makes her earn the vibe.",
      },
      {
        line: "Serious question — window seat or aisle, and are you the one who plans or the one who shows up hungover?",
        why: "Playful either/or, forces a self-reveal.",
      },
    ],
  },
  {
    bio: "Foodie bio",
    openers: [
      {
        line: "Foodie is a lifestyle claim. What's the last place that actually earned it?",
        why: "Skips small talk, moves toward a specific date suggestion.",
      },
      {
        line: "I'm judging you on your restaurant taste before anything else. What's your no-fail spot?",
        why: "Confident frame + easy answer + date bait.",
      },
    ],
  },
  {
    bio: "Fitness / gym bio",
    openers: [
      {
        line: "Are we doing coffee like normal people, or hiking-brunch-yoga first-date energy?",
        why: "Assumes the date, gives her a clear pick.",
      },
      {
        line: "Gym girl. Terrifying. What's the actual sport though, or is it all mirror selfies?",
        why: "Backhanded compliment, playful challenge.",
      },
    ],
  },
  {
    bio: "Sarcastic / dry bio",
    openers: [
      {
        line: "Your bio is a personality test and I'm about to fail it. What's the pass mark?",
        why: "Matches her tone, keeps it light.",
      },
      {
        line: "Okay, this is the funniest bio I've read tonight. What am I in for if I actually swipe right on this energy?",
        why: "Real reaction beats generic 'lol.'",
      },
    ],
  },
];

const PHOTO_OPENERS: Opener[] = [
  {
    line: "That {photo detail} pic is doing all the work. Story?",
    why: "Personal, shows you actually looked at her profile.",
  },
  {
    line: "Pic 3 says 'organized chaos.' Am I close, or am I reading it completely wrong?",
    why: "Confident guess + invitation to correct you.",
  },
  {
    line: "Your dog is the main character in this profile. What's his name and what does he think of your dating life?",
    why: "Instant reply-magnet whenever a pet appears.",
  },
  {
    line: "I need context for the {food/drink/place} pic. Worth it or overhyped?",
    why: "Specific detail = higher reply rate.",
  },
  {
    line: "You've got 'took one great pic and knew it' energy in your first photo. Confirm or deny.",
    why: "Compliments a vibe, not her looks.",
  },
];

const SAFE_BETS: Opener[] = [
  {
    line: "Serious question: what's your Tinder ick? I need to know if I'm already doing it.",
    why: "Self-aware, funny, gets her talking.",
  },
  {
    line: "Tell me your worst date story. Loser has to buy the first drink on ours.",
    why: "Assumes the date, playful stakes.",
  },
  {
    line: "I'm giving you a 9.2. What do I need to do to get above a 9.5?",
    why: "Confident frame that reads as playful, not cocky.",
  },
  {
    line: "Weirdly specific question — coffee, walk, or drinks. Which one are you cancelling first this week?",
    why: "Skips small talk, sets up the date.",
  },
  {
    line: "Rate your last three dates 1–10, and I'll tell you exactly what I'd do differently.",
    why: "Positions you as high-value + invites a story.",
  },
];

const RESPONSE_STRATEGIES: { situation: string; play: string; example: string }[] = [
  {
    situation: "She replies short ('haha', 'lol', 'yeah'):",
    play: "Don't ask more questions — she isn't invested yet. Raise the stakes with a mini challenge or a callback to her bio.",
    example:
      "'Okay you're saving your best lines. I'll drag them out of you — what's actually more fun on a Friday: dinner or something we shouldn't tell your friends about?'",
  },
  {
    situation: "She replies with a real answer (2+ sentences):",
    play: "Match her length, pull on the most specific detail, and end with an open question — never yes/no.",
    example: "'That's genuinely a wild story. What made you finally go through with it?'",
  },
  {
    situation: "She asks the boring reciprocal ('you?', 'how about you?'):",
    play: "Answer with personality, then flip to a date pull. Don't just answer flat.",
    example:
      "'Last thing I did that was actually fun? Kayaked at sunrise and immediately regretted the alarm. What's your version of that?'",
  },
  {
    situation: "She goes cold after 2–3 messages:",
    play: "One reset attempt, then move on. No 'you there?', no double-text guilt trip.",
    example:
      "'You disappeared. Rude. Give me one word for the last 48 hours and I'll build a whole story off it.'",
  },
  {
    situation: "She responds but never asks anything back:",
    play: "She's testing effort or she's just used to men doing the work. Either way, ask two rounds of good questions — then propose the date.",
    example: "'Okay I've made my case. Drinks Thursday — you pick the spot.'",
  },
];

const AVOID: string[] = [
  "'Hey' / 'Hi' / 'How's your day?' — dead on arrival, universal skip.",
  "'You're gorgeous 😍' / 'wow beautiful' — reads exactly like the 50 other messages in her inbox.",
  "Paragraph-long intros about yourself — she didn't ask.",
  "'DTF?' / anything crude in the first message — instant unmatch and possibly reported.",
  "Copy-pasted pickup lines from Reddit — she's seen every single one.",
  "Anything that requires her to explain herself ('why are you on Tinder?').",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What's the best Tinder opener in 2026?",
    a: "The best Tinder opener reacts to something specific in her bio or photos, adds a bit of playful confidence, and ends with one open-ended question. Copy the pattern, not the words — a generic pickup line is invisible in her inbox.",
  },
  {
    q: "Do Tinder pickup lines actually work?",
    a: "Recycled pickup lines don't. Personalized, confident, and specific openers do. Every line on this page follows a repeatable formula: react to a detail, tease the vibe, ask a real question.",
  },
  {
    q: "How long should a Tinder opener be?",
    a: "One or two sentences. Long enough to react and ask a question, short enough to feel casual and confident. Paragraphs kill your reply rate.",
  },
  {
    q: "How do I get more replies on Tinder?",
    a: "Fix your photos first — 80% of your Tinder reply rate comes from your profile, not your opener. Then use openers that (1) react to a specific detail, (2) show playful confidence, and (3) end with an open question.",
  },
  {
    q: "Is there an AI Tinder response generator?",
    a: "Yes — RizzGod AI generates tailored Tinder openers and follow-up replies based on her actual bio and photos, plus a brutally honest score of her profile. Free to start.",
  },
  {
    q: "Do these Tinder openers work on Bumble and Hinge too?",
    a: "Yes. All three apps reward the same skill — reacting specifically instead of pasting a generic hi. Swap 'bio' references for 'prompt' on Hinge and you're set.",
  },
];

export const Route = createFileRoute("/tinder-openers")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "tinder openers, best tinder openers, tinder pickup lines, tinder first message, tinder helper, ai tinder, tinder response generator, what to say on tinder",
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
            { "@type": "ListItem", position: 2, name: "Tinder Openers", item: PAGE_URL },
          ],
        }),
      },
    ],
  }),
  component: TinderOpenersPage,
});

function OpenerCard({ line, why }: Opener) {
  return (
    <div className="bg-card/60 backdrop-blur border border-border/60 rounded-2xl p-5 hover:border-gold/40 transition">
      <p className="text-base leading-relaxed text-foreground">"{line}"</p>
      <p className="mt-3 text-xs text-muted-foreground">
        <span className="text-gold font-bold uppercase tracking-wider mr-1">Why it works:</span>
        {why}
      </p>
    </div>
  );
}

function TinderOpenersPage() {
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
            Get my AI opener
          </Link>
        </div>
      </nav>

      <article className="max-w-3xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="inline-flex items-center gap-2 bg-card border border-gold/30 text-gold text-xs font-bold px-3 py-1.5 rounded-full mb-6 uppercase tracking-wider">
          <Flame size={14} /> Updated for 2026
        </div>
        <h1 className="display text-4xl md:text-6xl leading-[1.05] mb-5">
          60+ Best <span className="text-gradient-blood">Tinder openers</span> & response strategies
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Every line below is copy-paste ready and follows one rule: react to a specific bio detail
          or photo, then ask an open-ended question. Plus the exact reply strategy for every
          situation — short answers, cold conversations, real replies. No "hey beautiful," no dead
          openers.
        </p>

        <div className="flex flex-wrap gap-3 mb-12">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-gradient-blood text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-blood"
          >
            <Sparkles size={18} /> Generate a custom Tinder opener free
          </Link>
          <a
            href="#openers"
            className="inline-flex items-center gap-2 bg-card border border-border text-foreground font-semibold px-6 py-3 rounded-xl"
          >
            Jump to the openers <ArrowRight size={16} />
          </a>
        </div>

        <section className="bg-card/60 border border-border/60 rounded-2xl p-6 mb-12">
          <h2 className="display text-2xl mb-3">
            The 3-part formula behind every great Tinder opener
          </h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5">
            <li>
              <span className="text-foreground font-semibold">React to something specific</span> —
              her bio, a photo, a pet, a place, a food.
            </li>
            <li>
              <span className="text-foreground font-semibold">Add a playful frame</span> — tease,
              challenge, or reframe her vibe instead of complimenting her looks.
            </li>
            <li>
              <span className="text-foreground font-semibold">End with one open question</span> —
              never yes/no, never "how's your day."
            </li>
          </ol>
        </section>

        <section id="openers">
          <h2 className="display text-3xl md:text-4xl mb-2">
            Openers by <span className="text-gradient-gold">Tinder bio type</span>
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Match her bio, copy the pattern, tweak one detail. That's it.
          </p>

          {BIO_OPENERS.map((section) => (
            <div key={section.bio} className="mb-8">
              <h3 className="display text-xl mb-3 text-gold">{section.bio}</h3>
              <div className="grid gap-3">
                {section.openers.map((o) => (
                  <OpenerCard key={o.line} {...o} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="display text-3xl md:text-4xl mb-2">Photo-based Tinder openers</h2>
          <p className="text-sm text-muted-foreground mb-6">
            When her bio is thin, her photos aren't. Swap the{" "}
            <code className="text-gold">{"{detail}"}</code> for what you actually see.
          </p>
          <div className="grid gap-3">
            {PHOTO_OPENERS.map((o) => (
              <OpenerCard key={o.line} {...o} />
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="display text-3xl md:text-4xl mb-2">
            Safe-bet Tinder openers that work on almost any profile
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Bookmark these for the profiles where nothing jumps out.
          </p>
          <div className="grid gap-3">
            {SAFE_BETS.map((o) => (
              <OpenerCard key={o.line} {...o} />
            ))}
          </div>
        </section>

        <section className="mt-14">
          <h2 className="display text-3xl md:text-4xl mb-2">
            Tinder <span className="text-gradient-gold">response strategies</span> — what to say
            after she replies
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            The opener gets the match. The follow-up gets the date. Here's the play for every
            situation.
          </p>
          <div className="grid gap-4">
            {RESPONSE_STRATEGIES.map((r) => (
              <div key={r.situation} className="bg-card/60 border border-border/60 rounded-2xl p-5">
                <p className="font-semibold text-foreground mb-2">{r.situation}</p>
                <p className="text-sm text-muted-foreground mb-3">{r.play}</p>
                <p className="text-sm text-foreground italic bg-background/50 border-l-2 border-gold pl-3 py-2 rounded">
                  {r.example}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 bg-card/60 border border-primary/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-primary" />
            <h2 className="display text-2xl">
              Tinder openers to <span className="text-gradient-blood">never</span> send
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

        <section className="mt-14 bg-gradient-blood text-primary-foreground rounded-2xl p-8 text-center shadow-blood">
          <MessageSquareText size={32} className="mx-auto mb-3" />
          <h2 className="display text-3xl md:text-4xl mb-3">
            Want an opener tailored to <em>her</em> Tinder profile?
          </h2>
          <p className="text-sm md:text-base opacity-90 mb-6 max-w-lg mx-auto">
            Drop her Tinder screenshots into RizzGod AI — the AI Tinder helper that scores her
            profile 1–10, writes three custom openers, and drafts your exact follow-up when she
            replies. Free to start.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-background text-foreground font-bold px-6 py-3.5 rounded-xl"
          >
            Try the AI Tinder helper free <ArrowRight size={18} />
          </Link>
        </section>

        <section className="mt-14">
          <h2 className="display text-3xl md:text-4xl mb-6">
            Tinder openers — frequently asked questions
          </h2>
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
            See our{" "}
            <Link to="/pricing" className="text-gold hover:underline">
              plans
            </Link>{" "}
            ·{" "}
            <Link to="/hinge-openers" className="text-gold hover:underline">
              Hinge openers
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

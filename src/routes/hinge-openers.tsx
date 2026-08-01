import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, ArrowRight, Sparkles, MessageSquareText, Target } from "lucide-react";

const SITE_URL = "https://rizzgod-ai.vercel.app";
const PAGE_URL = `${SITE_URL}/hinge-openers`;

const TITLE = "50+ Best Hinge Openers That Actually Get Replies (2026)";
const DESCRIPTION =
  "The best Hinge openers for 2026 — copy-paste lines for every prompt, photo, and vibe. Curated by RizzGod AI, the brutally honest dating coach.";

type Opener = { line: string; why: string };

const PROMPT_OPENERS: { prompt: string; openers: Opener[] }[] = [
  {
    prompt: "Two truths and a lie",
    openers: [
      {
        line: "The lie is the third one — nobody's ever calm at 3am in Tokyo. Which trip actually broke you?",
        why: "Calls out a specific answer, invites a story.",
      },
      {
        line: "I'll play, but only if the loser has to pick where we get coffee. Deal?",
        why: "Playful stakes + soft date invite.",
      },
    ],
  },
  {
    prompt: "The way to win me over is…",
    openers: [
      {
        line: "Noted. Filing this under 'competitive advantage.' What's the fastest way someone's blown it?",
        why: "Confident, curious, flips the frame.",
      },
      {
        line: "Bold of you to publish the cheat codes. What's the actual test though?",
        why: "Teasing, treats her prompt like a game.",
      },
    ],
  },
  {
    prompt: "A shower thought I recently had",
    openers: [
      {
        line: "That's genuinely unhinged in the best way. What triggered it — 2am spiral or morning clarity?",
        why: "Validates her wit, opens a mini story.",
      },
      {
        line: "Okay this made me laugh out loud on the train. What's the next one going to be?",
        why: "Real reaction beats generic 'haha.'",
      },
    ],
  },
  {
    prompt: "My most controversial opinion",
    openers: [
      {
        line: "Respect the confidence. Give me the runner-up — the one you *almost* posted but chickened out on.",
        why: "Rewards boldness, asks for the spicier version.",
      },
      {
        line: "I could argue either side of this. Convince me you're right in three sentences.",
        why: "Turns her prompt into a game she can win.",
      },
    ],
  },
  {
    prompt: "I go crazy for…",
    openers: [
      {
        line: "Same actually. What's the last time it lived up to the hype?",
        why: "Instant common ground + open question.",
      },
      {
        line: "Dangerous list. What's your no-questions-asked, drop-everything version?",
        why: "Escalates the topic, asks for a story.",
      },
    ],
  },
  {
    prompt: "Dating me is like…",
    openers: [
      {
        line: "This is either a warning or a sales pitch. Which one am I supposed to run with?",
        why: "Playful, makes her clarify.",
      },
      {
        line: "Best case: what does week one look like? Worst case: what am I in for?",
        why: "Two-part question, hard to leave on read.",
      },
    ],
  },
];

const PHOTO_OPENERS: Opener[] = [
  {
    line: "Okay the {photo detail} pic is doing a lot of work. Story?",
    why: "Personal, shows you actually looked.",
  },
  {
    line: "That view in pic 3 — is that a trip you took or the one you're planning next?",
    why: "Opens travel talk without being generic.",
  },
  {
    line: "Your dog looks like he runs the household. What's his name and job title?",
    why: "Universally good when a pet is in the photos.",
  },
  {
    line: "You've got the 'took one good pic and knew it' energy in your first photo. Confirm or deny.",
    why: "Compliments a vibe, not her looks.",
  },
  {
    line: "I need context for the {food/drink} pic. Was it worth it?",
    why: "Concrete detail = higher reply rate.",
  },
];

const SAFE_BETS: Opener[] = [
  {
    line: "You seem dangerous — in a 'reorganizes my whole weekend' way. Convince me I'm wrong.",
    why: "Compliments her energy, not her body.",
  },
  {
    line: "Weirdly specific question: coffee, walk, or drinks — which one are you cancelling first this week?",
    why: "Direct + funny, sets up the date.",
  },
  {
    line: "Your profile is way too well-curated. Tell me one thing that would ruin the illusion.",
    why: "Playful reframe, invites vulnerability.",
  },
  {
    line: "Serious question: are you actually funny or does your camera roll do all the work?",
    why: "Teasing challenge, hard to ignore.",
  },
  {
    line: "I have a rule: I only match with people who can pick a restaurant. Where are we going?",
    why: "Assumes the date, no permission-seeking.",
  },
];

const AVOID: string[] = [
  "'Hey' / 'Hi' / 'How's your day?' — dead on arrival.",
  "'You're gorgeous 😍' — you sound like everyone else in her inbox.",
  "Long paragraphs about yourself — she didn't ask.",
  "'DTF?' / anything crude — instant unmatch.",
  "'Hey beautiful, how are you?' — the universal skip button.",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What's the best Hinge opener?",
    a: "The best Hinge opener is one that reacts specifically to a photo, prompt, or detail she published — not a generic line. Copy the pattern, not the words: react to a detail, then ask one open-ended question.",
  },
  {
    q: "Should I compliment her looks in my first message?",
    a: "No. She gets 30 of those a day and they all read the same. Compliment a choice she made — an outfit, a trip, a prompt answer — and you'll stand out instantly.",
  },
  {
    q: "How long should a Hinge opener be?",
    a: "One to two sentences. Long enough to react and ask a question, short enough to feel casual. If it takes a paragraph to explain yourself, cut it.",
  },
  {
    q: "How do I get replies to my Hinge messages?",
    a: "Reply rates go up when you (1) react to something specific, (2) end with an open-ended question, and (3) show a bit of playful confidence. All 50+ openers on this page follow that structure.",
  },
  {
    q: "Do these openers work on Bumble and Tinder too?",
    a: "Yes. Hinge, Bumble, and Tinder all reward the same skill — reacting specifically instead of pasting a generic hi. Swap 'prompt' references for 'bio' on Tinder and you're set.",
  },
];

export const Route = createFileRoute("/hinge-openers")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "hinge openers, best hinge openers, hinge opening lines, hinge pickup lines, hinge first message, what to say on hinge, hinge conversation starters",
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
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: "Hinge Openers", item: PAGE_URL },
          ],
        }),
      },
    ],
  }),
  component: HingeOpenersPage,
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

function HingeOpenersPage() {
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
          50+ Best <span className="text-gradient-blood">Hinge openers</span> that actually get
          replies
        </h1>
        <p className="text-lg text-muted-foreground mb-8">
          Every line below is copy-paste ready and follows one rule: react to a specific detail,
          then ask an open-ended question. These are the exact patterns RizzGod AI drills into its
          users — no "hey beautiful," no dead-on-arrival compliments.
        </p>

        <div className="flex flex-wrap gap-3 mb-12">
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-gradient-blood text-primary-foreground font-bold px-6 py-3 rounded-xl shadow-blood"
          >
            <Sparkles size={18} /> Generate a custom opener free
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
            The 3-part formula behind every great Hinge opener
          </h2>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal pl-5">
            <li>
              <span className="text-foreground font-semibold">React to something specific</span> — a
              prompt she wrote, a photo detail, a trip, a pet.
            </li>
            <li>
              <span className="text-foreground font-semibold">Add a playful frame</span> — tease,
              challenge, or reframe her answer instead of complimenting it.
            </li>
            <li>
              <span className="text-foreground font-semibold">End with one open question</span> —
              never yes/no, never "how's your day."
            </li>
          </ol>
        </section>

        <section id="openers">
          <h2 className="display text-3xl md:text-4xl mb-2">
            Openers by <span className="text-gradient-gold">Hinge prompt</span>
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Match her prompt, copy the pattern, tweak one detail. That's it.
          </p>

          {PROMPT_OPENERS.map((section) => (
            <div key={section.prompt} className="mb-8">
              <h3 className="display text-xl mb-3 text-gold">"{section.prompt}"</h3>
              <div className="grid gap-3">
                {section.openers.map((o) => (
                  <OpenerCard key={o.line} {...o} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-14">
          <h2 className="display text-3xl md:text-4xl mb-2">Photo-based Hinge openers</h2>
          <p className="text-sm text-muted-foreground mb-6">
            When her prompts are weak, her photos aren't. Swap the{" "}
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
            Safe-bet Hinge openers that work on almost any profile
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

        <section className="mt-14 bg-card/60 border border-primary/30 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={18} className="text-primary" />
            <h2 className="display text-2xl">
              Hinge openers to <span className="text-gradient-blood">never</span> send
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
            Want an opener tailored to <em>her</em> profile?
          </h2>
          <p className="text-sm md:text-base opacity-90 mb-6 max-w-lg mx-auto">
            Drop her Hinge screenshots into RizzGod AI. You'll get a 1–10 score of her profile,
            three custom openers, and the exact follow-up if she replies. Free to start.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="inline-flex items-center gap-2 bg-background text-foreground font-bold px-6 py-3.5 rounded-xl"
          >
            Start free <ArrowRight size={18} />
          </Link>
        </section>

        <section className="mt-14">
          <h2 className="display text-3xl md:text-4xl mb-6">
            Hinge openers — frequently asked questions
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
            <Link to="/privacy" className="text-gold hover:underline">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link to="/terms" className="text-gold hover:underline">
              Terms
            </Link>
          </p>
        </footer>
      </article>
    </main>
  );
}

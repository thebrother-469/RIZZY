import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { createChat } from "@/lib/chat";
import { Theater } from "lucide-react";

const SCENARIOS = [
  {
    id: "first-date",
    title: "First Date",
    desc: "She's across the table at a wine bar.",
    scenario:
      "She's a 24yo grad student you matched with on Hinge. You're at a dimly lit wine bar on a first date. She's into art and travel. Be her — challenging, witty, slightly playful but testing if you're a high-value man.",
  },
  {
    id: "bar-meet",
    title: "Bar Meet",
    desc: "Cold approach at a busy lounge.",
    scenario:
      "You're at a Friday night cocktail lounge. She's with one friend at the bar. You just walked up. Be her — initially aloof, slightly amused. Reward genuine confidence, shut down try-hard energy.",
  },
  {
    id: "texting",
    title: "Texting Back",
    desc: "Keep her engaged via DM.",
    scenario:
      "You matched 2 days ago. She replied once with 'haha what's up'. Roleplay text-message style — short replies, emojis allowed, occasionally leave him on read for realism. Be her — busy, lots of options.",
  },
  {
    id: "second-date",
    title: "Second Date",
    desc: "Time to escalate.",
    scenario:
      "Second date at a rooftop bar. The vibe is good. She's open. Roleplay her — receptive but waiting for him to lead, escalate, and create tension. Reward bold but smooth moves; shut down hesitation.",
  },
  {
    id: "ex-came-back",
    title: "The Ex Test",
    desc: "She's testing your frame.",
    scenario:
      "She's an ex who reached out 'just to catch up'. Be her — testing if he's still pining or has leveled up. Reward unbothered high-value energy. Shut down any neediness instantly.",
  },
];

export const Route = createFileRoute("/app/roleplay")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live Dating Roleplay — RizzGod AI" },
      {
        name: "description",
        content:
          "Practice real dating scenarios with RizzGod AI. First dates, cold approach, texting, and more — with live coach feedback between turns.",
      },
      { property: "og:title", content: "Live Dating Roleplay — RizzGod AI" },
      {
        property: "og:description",
        content: "Live dating roleplay sims with in-turn coach feedback from RizzGod AI.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/roleplay" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/roleplay" }],
  }),
  component: RoleplayPage,
});

function RoleplayPage() {
  const { id } = Route.useSearch();
  const nav = useNavigate();
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  const start = async (s: (typeof SCENARIOS)[0]) => {
    const c = await createChat("roleplay", s.title, s.scenario);
    setActiveScenario(s.scenario);
    nav({ to: "/app/roleplay", search: { id: c.id } });
  };

  if (!id) {
    return (
      <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto">
        <div className="text-xs text-gold uppercase tracking-widest font-bold mb-1">Roleplay</div>
        <h1 className="display text-3xl md:text-4xl mb-2">
          Pick your <span className="text-gradient-blood">scenario</span>
        </h1>
        <p className="text-muted-foreground mb-8">
          Practice the real thing. She'll react like a real woman would. Coach drops in with tips.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => start(s)}
              className="text-left bg-card border border-border/60 rounded-2xl p-5 hover:border-gold/40 transition group"
            >
              <div className="h-10 w-10 rounded-lg bg-gradient-blood flex items-center justify-center text-primary-foreground mb-3 shadow-blood">
                <Theater size={18} />
              </div>
              <div className="display text-xl mb-1 group-hover:text-gold transition">{s.title}</div>
              <div className="text-sm text-muted-foreground">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[var(--app-height,100dvh)] min-h-0">
      <div className="px-4 md:px-8 py-3 border-b border-border/60 bg-card/30 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-gold uppercase tracking-widest font-bold">
            Live Roleplay
          </div>
          <div className="text-sm font-semibold">She's waiting. Make your move.</div>
        </div>
        <button
          onClick={() => nav({ to: "/app/roleplay", search: { id: undefined } })}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← New scenario
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <ChatWindow
          chatId={id}
          mode="roleplay"
          scenario={activeScenario ?? undefined}
          placeholder="Open with confidence..."
        />
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { COACHES } from "@/lib/coaches";

export const Route = createFileRoute("/app/coaches")({
  head: () => ({
    meta: [
      { title: "Meet Your AI Dating Coaches — RizzGod AI" },
      {
        name: "description",
        content:
          "Ten elite AI dating coaches with different styles and playbooks. Pick the specialist that fits what you're working on today.",
      },
      { property: "og:title", content: "Meet Your AI Dating Coaches — RizzGod AI" },
      {
        property: "og:description",
        content:
          "Ten specialist AI dating coaches, each with a unique style. Pick yours in RizzGod AI.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/coaches" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/coaches" }],
  }),
  component: CoachesPage,
});

function CoachesPage() {
  const nav = useNavigate();
  return (
    <div className="px-4 md:px-8 py-8 max-w-6xl mx-auto">
      <div className="text-xs text-gold uppercase tracking-widest font-bold mb-1">Coaches</div>
      <h1 className="display text-3xl md:text-5xl mb-2">
        Pick your <span className="text-gradient-blood">specialist</span>
      </h1>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Ten elite AI coaches, each with their own style and playbook. Pick the one that fits what
        you're working on today.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {COACHES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              onClick={() => nav({ to: "/app/coach", search: { c: c.id, id: undefined } })}
              className="text-left bg-card border border-border/60 rounded-2xl p-5 hover:border-gold/40 hover:-translate-y-0.5 transition group"
            >
              <div
                className={`h-11 w-11 rounded-xl flex items-center justify-center mb-3 shadow-blood ${
                  c.accent === "blood"
                    ? "bg-gradient-blood text-primary-foreground"
                    : "bg-gradient-gold text-gold-foreground"
                }`}
              >
                <Icon size={20} />
              </div>
              <div className="display text-xl mb-1 group-hover:text-gold transition">{c.name}</div>
              <div className="text-xs text-gold/80 font-semibold uppercase tracking-wider mb-2">
                {c.tagline}
              </div>
              <div className="text-sm text-muted-foreground">{c.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

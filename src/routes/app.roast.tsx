import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useUserTitle } from "@/hooks/use-title";
import { useEffect, useRef, useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { RoastUploader, type RoastShot } from "@/components/RoastUploader";
import { createChat } from "@/lib/chat";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/app/roast")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Roast My DMs — RizzGod AI" },
      {
        name: "description",
        content:
          "Upload your dating app screenshots and get a brutally honest roast plus elite rewrites from RizzGod AI. Fix your game, fast.",
      },
      { property: "og:title", content: "Roast My DMs — RizzGod AI" },
      {
        property: "og:description",
        content: "Screenshot roast: brutal feedback and elite rewrites for your dating app convos.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/roast" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/roast" }],
  }),
  component: RoastPage,
});

type Seed = { prompt: string; shots: RoastShot[] };
const SEED_KEY = "rizz_roast_seed";

function RoastPage() {
  const { id } = Route.useSearch();
  const { user } = useAuth();
  const nav = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  if (id) return <RoastConversation chatId={id} />;

  const onConfirm = async (payload: {
    shots: RoastShot[];
    context: string;
    goal: string;
    prompt: string;
  }) => {
    if (!user) {
      toast.error("Sign in first.");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const chat = await createChat(
        "roast",
        `Roast — ${payload.goal} · ${new Date().toLocaleDateString()}`,
      );
      const seed: Seed = { prompt: payload.prompt, shots: payload.shots };
      sessionStorage.setItem(`${SEED_KEY}:${chat.id}`, JSON.stringify(seed));
      nav({ to: "/app/roast", search: { id: chat.id } });
    } catch (e) {
      console.error(e);
      toast.error("Couldn't start the roast. Try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-dvh">
      <div className="px-4 md:px-8 py-4 border-b border-border/60 bg-card/30">
        <div className="text-xs text-gold uppercase tracking-widest font-bold">Roast My DMs</div>
        <h1 className="display text-2xl md:text-3xl">Upload your convo. Get the truth.</h1>
        <p className="text-sm text-muted-foreground mt-1">{title.sentence("No filter")}</p>
      </div>
      <RoastUploader onConfirm={onConfirm} />
    </div>
  );
}

function RoastConversation({ chatId }: { chatId: string }) {
  return (
    <div className="flex flex-col h-dvh">
      <div className="px-4 md:px-8 py-3 border-b border-border/60 bg-card/30 flex items-center gap-3">
        <Link
          to="/app/roast"
          search={{ id: undefined }}
          className="text-muted-foreground hover:text-gold inline-flex items-center gap-1 text-xs font-semibold"
        >
          <ArrowLeft size={14} /> New roast
        </Link>
        <div className="flex-1">
          <div className="text-[10px] text-gold uppercase tracking-widest font-bold">
            Roast My DMs
          </div>
          <h1 className="display text-lg md:text-xl">The truth, raw.</h1>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <ChatWindow
          chatId={chatId}
          mode="roast"
          allowImage
          placeholder="Ask a follow-up. Or upload another screenshot."
          seedKey={`${SEED_KEY}:${chatId}`}
        />
      </div>
    </div>
  );
}

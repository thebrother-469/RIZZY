import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { createChat, deleteChatIfEmpty, getOrCreateChat } from "@/lib/chat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { COACHES, getCoach } from "@/lib/coaches";
import { Plus, MessageSquareText, ArrowLeft } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ChatRow = Pick<
  Database["public"]["Tables"]["chats"]["Row"],
  "id" | "scenario" | "title" | "updated_at"
>;

export const Route = createFileRoute("/app/coach")({
  validateSearch: (s: Record<string, unknown>) => ({
    c: typeof s.c === "string" ? s.c : undefined,
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "AI Dating Coach Chat — RizzGod AI" },
      {
        name: "description",
        content:
          "Chat 1-on-1 with your chosen RizzGod AI coach. Get personalized dating strategy, texting rewrites, and confidence reps in real time.",
      },
      { property: "og:title", content: "AI Dating Coach Chat — RizzGod AI" },
      {
        property: "og:description",
        content: "Personalized 1-on-1 chat with a specialist RizzGod AI dating coach.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/coach" },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/coach" }],
  }),
  component: CoachChatPage,
});

function CoachChatPage() {
  const { c: coachId, id } = Route.useSearch();
  const { user } = useAuth();
  const nav = useNavigate();
  const coach = getCoach(coachId);
  const [chats, setChats] = useState<ChatRow[]>([]);

  useEffect(() => {
    if (!coach) nav({ to: "/app/coaches" });
  }, [coach]);

  useEffect(() => {
    if (!user || !coach) return;
    supabase
      .from("chats")
      .select("id, title, updated_at, scenario")
      .eq("user_id", user.id)
      .eq("mode", "chat")
      .ilike("title", `${coach.name}%`)
      .order("updated_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setChats(data ?? []));
  }, [user?.id, coach?.id, id]);

  useEffect(() => {
    if (!id && user && coach) {
      getOrCreateChat({
        mode: "chat",
        title: `${coach.name} — ${new Date().toLocaleDateString()}`,
        scenario: coach.prompt,
        titlePrefix: coach.name,
      }).then((chat) =>
        nav({ to: "/app/coach", search: { c: coach.id, id: chat.id }, replace: true }),
      );
    }
  }, [id, user?.id, coach?.id]);

  // Clean up an empty coach session on nav-away.
  const lastIdRef = useRef<string | undefined>(id);
  useEffect(() => {
    const prev = lastIdRef.current;
    lastIdRef.current = id;
    if (prev && prev !== id) void deleteChatIfEmpty(prev);
  }, [id]);
  useEffect(() => {
    return () => {
      const cid = lastIdRef.current;
      if (cid) void deleteChatIfEmpty(cid);
    };
  }, []);

  if (!coach) return null;

  const newSession = async () => {
    const chat = await createChat(
      "chat",
      `${coach.name} — ${new Date().toLocaleString()}`,
      coach.prompt,
    );
    nav({ to: "/app/coach", search: { c: coach.id, id: chat.id } });
  };

  const Icon = coach.icon;

  return (
    <div className="flex h-[var(--app-height,100dvh)] min-h-0">
      <aside className="hidden lg:flex flex-col w-64 border-r border-border/60 bg-card/30">
        <div className="p-4 border-b border-border/60 space-y-3">
          <button
            onClick={() => nav({ to: "/app/coaches" })}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={12} /> All coaches
          </button>
          <div className="flex items-center gap-2">
            <div
              className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                coach.accent === "blood"
                  ? "bg-gradient-blood text-primary-foreground"
                  : "bg-gradient-gold text-gold-foreground"
              }`}
            >
              <Icon size={16} />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{coach.name}</div>
              <div className="text-[10px] text-gold uppercase tracking-wider font-bold truncate">
                {coach.tagline}
              </div>
            </div>
          </div>
          <button
            onClick={newSession}
            className="w-full flex items-center justify-center gap-2 bg-gradient-blood text-primary-foreground font-semibold py-2 rounded-lg shadow-blood text-sm"
          >
            <Plus size={14} /> New session
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => nav({ to: "/app/coach", search: { c: coach.id, id: chat.id } })}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                chat.id === id
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50"
              }`}
            >
              <MessageSquareText size={14} className="shrink-0" />
              <span className="truncate">{chat.title}</span>
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-border/60">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1.5">
            Switch coach
          </div>
          <div className="grid grid-cols-5 gap-1">
            {COACHES.map((other) => {
              const OtherIcon = other.icon;
              return (
                <button
                  key={other.id}
                  onClick={() => nav({ to: "/app/coach", search: { c: other.id, id: undefined } })}
                  title={other.name}
                  className={`aspect-square rounded-md flex items-center justify-center transition ${
                    other.id === coach.id
                      ? "bg-gradient-blood text-primary-foreground"
                      : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <OtherIcon size={12} />
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <ChatWindow
          chatId={id ?? null}
          mode="chat"
          scenario={coach.prompt}
          coachId={coach.id}
          placeholder={coach.placeholder}
        />
      </div>
    </div>
  );
}

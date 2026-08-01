import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { createChat, deleteChatIfEmpty, getOrCreateChat } from "@/lib/chat";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Plus, MessageSquareText, Search } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ChatRow = Pick<
  Database["public"]["Tables"]["chats"]["Row"],
  "id" | "mode" | "title" | "updated_at"
>;

export const Route = createFileRoute("/app/chat")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Practice Chat — RizzGod AI" },
      {
        name: "description",
        content:
          "Practice flirting with RizzGod AI. Drop a line, get a 1-10 score, brutal feedback, and elite rewrites in real time.",
      },
      { property: "og:title", content: "Practice Chat — RizzGod AI" },
      {
        property: "og:description",
        content:
          "Live practice chat with RizzGod AI — scores, feedback, and elite rewrites for every line.",
      },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/app/chat" },
      { name: "twitter:title", content: "Practice Chat — RizzGod AI" },
      {
        name: "twitter:description",
        content: "Live practice chat with RizzGod AI — scores, feedback, and elite rewrites.",
      },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/app/chat" }],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { id } = Route.useSearch();
  const { user } = useAuth();
  const nav = useNavigate();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("chats")
      .select("id, title, mode, updated_at")
      .eq("user_id", user.id)
      .eq("mode", "chat")
      .order("updated_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setChats(data ?? []));
  }, [user?.id, id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter((c) => (c.title ?? "").toLowerCase().includes(needle));
  }, [chats, q]);

  useEffect(() => {
    if (!id && user) {
      getOrCreateChat({
        mode: "chat",
        title: "Practice — " + new Date().toLocaleDateString(),
      }).then((c) => nav({ to: "/app/chat", search: { id: c.id }, replace: true }));
    }

    // Clean up an empty chat when the user navigates away without sending.
  }, [id, user?.id]);

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

  const newChat = async () => {
    const c = await createChat("chat", "Practice — " + new Date().toLocaleString());
    nav({ to: "/app/chat", search: { id: c.id } });
  };

  return (
    <div className="flex h-[var(--app-height,100dvh)] min-h-0">
      <aside className="hidden lg:flex flex-col w-64 border-r border-border/60 bg-card/30">
        <div className="p-4 border-b border-border/60">
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 bg-gradient-blood text-primary-foreground font-semibold py-2.5 rounded-lg shadow-blood text-sm"
          >
            <Plus size={16} /> New session
          </button>
        </div>
        <div className="px-3 pt-3">
          <label className="relative block">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search sessions"
              aria-label="Search sessions"
              className="w-full h-8 pl-7 pr-2 rounded-md bg-secondary/60 border border-border/60 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No sessions match.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => nav({ to: "/app/chat", search: { id: c.id } })}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${c.id === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50"}`}
              >
                <MessageSquareText size={14} className="shrink-0" />
                <span className="truncate">{c.title}</span>
              </button>
            ))
          )}
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <h1 className="sr-only">Practice Chat</h1>
        <ChatWindow
          chatId={id ?? null}
          mode="chat"
          placeholder="Drop a line you want to send her, paste a convo, or ask anything."
        />
      </div>
    </div>
  );
}

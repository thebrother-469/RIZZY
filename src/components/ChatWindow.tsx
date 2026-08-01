import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Loader2, ArrowDown, Copy, RotateCw, Check, Square, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useRizzChat, type ChatMode } from "@/lib/chat";
import { ChatComposer } from "@/components/ChatComposer";
import { useUserTitle } from "@/hooks/use-title";
import { MessageContent } from "@/components/MessageContent";

function ChatImage({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-lg bg-secondary/40">
      {!loaded && <div className="absolute inset-0 shimmer" aria-hidden="true" />}
      <img
        src={src}
        alt="Screenshot shared in the chat"
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`max-h-48 w-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100 img-fade-in" : "opacity-0"}`}
      />
    </div>
  );
}

export function ChatWindow({
  chatId,
  mode,
  scenario,
  coachId,
  placeholder,
  seedKey,
}: {
  chatId: string | null;
  mode: ChatMode;
  scenario?: string;
  coachId?: string;
  placeholder?: string;
  /** @deprecated composer now always allows attachments */
  allowImage?: boolean;
  seedKey?: string;
}) {
  const { messages, streaming, send, stop, retry, loadingHistory, editUserMessage } = useRizzChat({
    chatId,
    mode,
    scenario,
    coachId,
  });

  const title = useUserTitle();

  const scrollRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const copyMessage = useCallback(async (id: string, content: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        // Fallback for insecure/legacy contexts.
        const ta = document.createElement("textarea");
        ta.value = content;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId((v) => (v === id ? null : v)), 1400);
    } catch {
      toast.error("Copy failed");
    }
  }, []);

  const beginEdit = useCallback((idx: number, current: string) => {
    setEditingIdx(idx);
    setEditDraft(current);
  }, []);
  const cancelEdit = useCallback(() => {
    setEditingIdx(null);
    setEditDraft("");
  }, []);
  const saveEdit = useCallback(
    async (idx: number) => {
      const text = editDraft.trim();
      if (!text) {
        toast.error("Message can't be empty");
        return;
      }
      setEditingIdx(null);
      setEditDraft("");
      await editUserMessage(idx, text);
    },
    [editDraft, editUserMessage],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Track whether user is scrolled to bottom (within threshold)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtBottom(distance < 80);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [chatId]);

  // Auto-scroll only when user is already near bottom, avoiding jump-back-up UX
  useLayoutEffect(() => {
    if (atBottom) scrollToBottom(streaming ? "auto" : "smooth");
  }, [messages, streaming, atBottom, scrollToBottom]);

  // Snap to bottom on chat switch / first load
  useEffect(() => {
    if (!loadingHistory) scrollToBottom("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, loadingHistory]);

  // Auto-send seed payload (used by Roast review → conversation)
  useEffect(() => {
    if (!seedKey || seededRef.current || loadingHistory || !chatId) return;
    if (messages.length > 0) {
      seededRef.current = true;
      return;
    }
    const raw = sessionStorage.getItem(seedKey);
    if (!raw) return;
    try {
      const seed = JSON.parse(raw) as { prompt: string; shots: { url: string }[] };
      sessionStorage.removeItem(seedKey);
      seededRef.current = true;
      const urls = seed.shots.map((s) => s.url);
      send(seed.prompt, urls[0] ?? null, urls);
    } catch {
      sessionStorage.removeItem(seedKey);
    }
  }, [seedKey, loadingHistory, chatId, messages.length, send]);

  const handleSend = (text: string, urls: string[]) => {
    send(text, urls[0] ?? null, urls.length ? urls : null);
    // Force pin to bottom for user's own message
    setAtBottom(true);
    requestAnimationFrame(() => scrollToBottom("smooth"));
  };

  const formatTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative flex flex-col h-full min-h-0 lg:h-dvh">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain scrollbar-thin px-3 md:px-8 py-6"
        role="log"
        aria-live="polite"
        aria-atomic="false"
      >
        <div className="max-w-4xl mx-auto space-y-4">
          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-gold" aria-label="Loading" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto msg-in">
              <div className="display text-3xl text-gradient-blood mb-2">
                {title.sentence("Let's go")}
              </div>
              <p className="text-muted-foreground text-sm">
                {placeholder ||
                  "Drop a line you want to send her, paste a convo, or just talk shit. I'll handle the rest."}
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const imgs =
                m.image_urls && m.image_urls.length
                  ? m.image_urls
                  : m.image_url
                    ? [m.image_url]
                    : [];
              const isUser = m.role === "user";
              const isLast = i === messages.length - 1;
              const isStreamingLast = isLast && streaming && m.role === "assistant";
              const timeLabel = formatTime(m.created_at);
              return (
                <div
                  key={m.id ?? i}
                  className={`flex msg-in ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex flex-col max-w-[88%] md:max-w-[72%] ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 break-words ${isUser ? "bg-gradient-blood text-primary-foreground shadow-blood rounded-br-md" : "bg-card border border-border/60 shadow-card rounded-bl-md"} ${editingIdx === i ? "w-full md:w-[560px] max-w-full" : ""}`}
                    >
                      {imgs.length > 0 && (
                        <div
                          className={`grid gap-1.5 mb-2 ${imgs.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                        >
                          {imgs.map((u, k) => (
                            <ChatImage key={k} src={u} />
                          ))}
                        </div>
                      )}
                      {isUser && editingIdx === i ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                void saveEdit(i);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                            autoFocus
                            rows={Math.min(8, Math.max(2, editDraft.split("\n").length))}
                            className="w-full bg-black/20 text-primary-foreground placeholder:text-primary-foreground/60 rounded-md p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gold/60"
                            aria-label="Edit message"
                          />
                          <div className="flex justify-end gap-2 text-xs">
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1 rounded-md bg-black/20 hover:bg-black/30 transition"
                              type="button"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => void saveEdit(i)}
                              className="px-3 py-1 rounded-md bg-white/90 text-black font-semibold hover:bg-white transition"
                              type="button"
                            >
                              Save &amp; regenerate
                            </button>
                          </div>
                        </div>
                      ) : m.content ? (
                        isUser ? (
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">
                            {m.content}
                          </div>
                        ) : (
                          <MessageContent text={m.content + (isStreamingLast ? "\u200B" : "")} />
                        )
                      ) : isStreamingLast ? (
                        <span className="inline-flex gap-1 py-1" aria-label="Coach is thinking">
                          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse [animation-delay:0.2s]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse [animation-delay:0.4s]" />
                        </span>
                      ) : null}
                      {isStreamingLast && m.content && (
                        <span className="stream-caret text-gold" aria-hidden="true" />
                      )}
                    </div>
                    <div
                      className={`mt-1 flex items-center gap-1.5 px-1 ${isUser ? "flex-row-reverse" : ""}`}
                    >
                      {timeLabel && (
                        <span className="text-[10px] text-muted-foreground/70 select-none">
                          {timeLabel}
                        </span>
                      )}
                      {isUser && m.content && editingIdx !== i && !streaming && (
                        <>
                          <button
                            onClick={() => copyMessage(String(m.id ?? i), m.content)}
                            className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-gold transition p-1 -m-1 rounded"
                            aria-label="Copy message"
                            title="Copy"
                          >
                            {copiedId === String(m.id ?? i) ? (
                              <Check size={12} />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                          <button
                            onClick={() => beginEdit(i, m.content)}
                            className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-gold transition p-1 -m-1 rounded"
                            aria-label="Edit and regenerate"
                            title="Edit"
                          >
                            <Pencil size={12} />
                          </button>
                        </>
                      )}
                      {isUser && editingIdx === i && (
                        <button
                          onClick={cancelEdit}
                          className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-gold transition p-1 -m-1 rounded"
                          aria-label="Cancel edit"
                          title="Cancel"
                        >
                          <X size={12} />
                        </button>
                      )}
                      {!isUser && m.content && !isStreamingLast && (
                        <>
                          <button
                            onClick={() => copyMessage(String(m.id ?? i), m.content)}
                            className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-gold transition p-1 -m-1 rounded"
                            aria-label="Copy message"
                            title="Copy"
                          >
                            {copiedId === String(m.id ?? i) ? (
                              <Check size={12} />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                          {isLast && !streaming && (
                            <button
                              onClick={retry}
                              className="opacity-60 hover:opacity-100 text-muted-foreground hover:text-gold transition p-1 -m-1 rounded"
                              aria-label="Regenerate response"
                              title="Regenerate"
                            >
                              <RotateCw size={12} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Scroll-to-bottom pill */}
      {!atBottom && !loadingHistory && messages.length > 0 && (
        <button
          onClick={() => {
            setAtBottom(true);
            scrollToBottom("smooth");
          }}
          className="absolute right-4 bottom-24 md:bottom-28 z-10 h-9 w-9 rounded-full bg-card border border-border/60 shadow-card flex items-center justify-center text-gold hover:border-gold/60 press msg-in"
          aria-label="Scroll to latest"
        >
          <ArrowDown size={16} />
        </button>
      )}

      {streaming && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 md:bottom-28 z-10">
          <button
            onClick={stop}
            className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-card border border-border/60 shadow-card text-xs font-semibold text-foreground hover:border-gold/60 press msg-in"
            aria-label="Stop generating"
          >
            <Square size={12} className="fill-current" /> Stop
          </button>
        </div>
      )}

      <div className="composer-dock">
        <ChatComposer
          disabled={!chatId}
          streaming={streaming}
          placeholder={placeholder}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}

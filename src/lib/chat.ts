import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { refreshSignedUrl } from "@/lib/attachments";
import { errorName } from "@/lib/errors";

export type ChatMode = "chat" | "roast" | "roleplay" | "photo";
export type Msg = {
  id?: string;
  role: "user" | "assistant" | "system";
  content: string;
  image_url?: string | null;
  image_urls?: string[] | null;
  created_at?: string;
};

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rizz-coach`;

export function useRizzChat(opts: {
  chatId: string | null;
  mode: ChatMode;
  scenario?: string;
  coachId?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Reset the transcript synchronously when the conversation changes, using
  // React's documented render-phase state adjustment instead of an effect so
  // stale messages never paint for the new chat.
  const [lastChatId, setLastChatId] = useState(opts.chatId);
  if (lastChatId !== opts.chatId) {
    setLastChatId(opts.chatId);
    setMessages([]);
  }

  // load history
  useEffect(() => {
    const cid = opts.chatId;
    if (!cid) return;
    let cancel = false;

    (async () => {
      setLoadingHistory(true);
      const { data } = await supabase
        .from("messages")
        .select("id, role, content, image_url, created_at")
        .eq("chat_id", cid)
        .order("created_at", { ascending: true });
      if (cancel) return;
      const rows = (data ?? []) as Msg[];
      // Re-sign stored image URLs so old messages keep rendering after the
      // original 1h signature expires. Failures fall back to the stored URL.
      const rehydrated = await Promise.all(
        rows.map(async (m) => {
          if (!m.image_url) return m;
          try {
            return { ...m, image_url: await refreshSignedUrl(m.image_url) };
          } catch {
            return m;
          }
        }),
      );
      if (cancel) return;
      setMessages(rehydrated);
      setLoadingHistory(false);
    })();
    return () => {
      cancel = true;
    };
  }, [opts.chatId]);

  const send = useCallback(
    async (
      text: string,
      image_url?: string | null,
      image_urls?: string[] | null,
      baseOverride?: Msg[],
    ) => {
      if (!opts.chatId || (!text.trim() && !image_url && !(image_urls && image_urls.length)))
        return;
      // Re-sign attached image URLs so the AI gateway always gets a fresh token,
      // even if the composer held the attachment past the 1h expiry.
      const freshUrl = image_url
        ? await refreshSignedUrl(image_url).catch(() => image_url)
        : image_url;
      const freshUrls = image_urls
        ? await Promise.all(image_urls.map((u) => refreshSignedUrl(u).catch(() => u)))
        : image_urls;
      const userMsg: Msg = {
        role: "user",
        content: text,
        image_url: freshUrl ?? freshUrls?.[0] ?? null,
        image_urls: freshUrls ?? null,
      };
      const base = baseOverride ?? messages;
      const next = [...base, userMsg];
      setMessages([...next, { role: "assistant", content: "" }]);
      setStreaming(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error("Sign in first.");
        setStreaming(false);
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch(FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          },
          body: JSON.stringify({
            chatId: opts.chatId,
            mode: opts.mode,
            scenario: opts.scenario,
            coachId: opts.coachId,
            messages: next.map(({ role, content, image_url, image_urls }) => ({
              role,
              content,
              image_url,
              image_urls,
            })),
          }),
          signal: ac.signal,
        });

        if (res.status === 402) {
          const j = await res.json().catch(() => ({}));
          toast.error(j.message || "Free limit hit. Upgrade to keep training.");
          setMessages(next);
          setStreaming(false);
          return;
        }
        if (res.status === 429) {
          toast.error("Slow down. Try again in a sec.");
          setMessages(next);
          setStreaming(false);
          return;
        }
        if (!res.ok || !res.body) {
          toast.error("Coach is offline. Try again.");
          setMessages(next);
          setStreaming(false);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let assistant = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n")) !== -1) {
            let line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (!line.startsWith("data: ")) continue;
            const j = line.slice(6).trim();
            if (j === "[DONE]") continue;
            try {
              const parsed = JSON.parse(j);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === "string") {
                assistant += delta;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: assistant };
                  return copy;
                });
              }
            } catch {
              buf = line + "\n" + buf;
              break;
            }
          }
        }

        // Reconcile with persisted rows so local messages carry their real
        // id/created_at. Without this, a later edit cannot compute a prune
        // cutoff and stale turns survive a reload. Best-effort: on any
        // mismatch or failure we keep the optimistic local state.
        try {
          const { data: rows } = await supabase
            .from("messages")
            .select("id, role, content, image_url, created_at")
            .eq("chat_id", opts.chatId)
            .order("created_at", { ascending: true });
          if (rows && rows.length) {
            const persisted = rows as Msg[];
            setMessages((prev) => {
              if (persisted.length < prev.length - 1) return prev;
              return persisted.map((p, i) => ({
                ...p,
                // keep freshly signed URLs from this turn where available
                image_url: prev[i]?.image_url ?? p.image_url,
                image_urls: prev[i]?.image_urls ?? null,
              }));
            });
          }
        } catch (e) {
          console.error("chat reconcile failed", e);
        }
      } catch (e) {
        if (errorName(e) !== "AbortError") {
          console.error(e);
          toast.error("Connection dropped.");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [opts.chatId, opts.mode, opts.scenario, opts.coachId, messages],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    // Drop the trailing empty assistant placeholder if nothing streamed in.
    setMessages((prev) => {
      if (!prev.length) return prev;
      const last = prev[prev.length - 1];
      if (last.role === "assistant" && !last.content) return prev.slice(0, -1);
      return prev;
    });
  }, []);

  const retry = useCallback(() => {
    // Regenerate the last assistant reply from the last user turn
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx < 0) return;
    const u = messages[lastUserIdx];
    const base = messages.slice(0, lastUserIdx);
    setMessages(base);
    void send(u.content, u.image_url ?? null, u.image_urls ?? null, base);
  }, [messages, send]);

  /**
   * Rewrite a previous user message and regenerate downstream conversation.
   * Deletes persisted rows at/after the edited message so history stays
   * consistent after reload, then re-sends via the normal streaming path.
   */
  const editUserMessage = useCallback(
    async (index: number, newText: string) => {
      if (!opts.chatId) return;
      if (index < 0 || index >= messages.length) return;
      const target = messages[index];
      if (target.role !== "user") return;
      const trimmed = newText.trim();
      if (!trimmed && !target.image_url && !(target.image_urls && target.image_urls.length)) return;

      const base = messages.slice(0, index);
      setMessages(base);

      try {
        let cutoff = target.created_at ?? null;
        if (!cutoff && target.id) {
          const { data: row } = await supabase
            .from("messages")
            .select("created_at")
            .eq("id", target.id)
            .maybeSingle();
          cutoff = row?.created_at ?? null;
        }
        if (cutoff) {
          await supabase
            .from("messages")
            .delete()
            .eq("chat_id", opts.chatId)
            .gte("created_at", cutoff);
        }
      } catch (e) {
        console.error("edit prune failed", e);
      }

      await send(trimmed, target.image_url ?? null, target.image_urls ?? null, base);
    },
    [messages, opts.chatId, send],
  );

  return { messages, streaming, loadingHistory, send, stop, retry, editUserMessage };
}

export async function createChat(mode: ChatMode, title: string, scenario?: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("chats")
    .insert({ user_id: user.id, mode, title, scenario })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Reuse the caller's most recent empty chat matching the filter, else create
 * a new one. Prevents piling up blank sessions when users open a chat and
 * navigate away without sending anything.
 */
export async function getOrCreateChat(opts: {
  mode: ChatMode;
  title: string;
  scenario?: string;
  titlePrefix?: string;
}) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let q = supabase
    .from("chats")
    .select("id, title, scenario, updated_at")
    .eq("user_id", user.id)
    .eq("mode", opts.mode)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (opts.titlePrefix) q = q.ilike("title", `${opts.titlePrefix}%`);
  const { data: recent } = await q;

  for (const c of recent ?? []) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", c.id);
    if ((count ?? 0) === 0) {
      const patch: { updated_at: string; scenario?: string } = {
        updated_at: new Date().toISOString(),
      };
      if (opts.scenario !== undefined) patch.scenario = opts.scenario;
      await supabase.from("chats").update(patch).eq("id", c.id);
      return { id: c.id, title: c.title, scenario: c.scenario };
    }
  }

  return await createChat(opts.mode, opts.title, opts.scenario);
}

/**
 * Delete a chat if it has no messages. Safe to call on unmount / navigation
 * away — swallows errors so it never blocks navigation.
 */
export async function deleteChatIfEmpty(chatId: string): Promise<boolean> {
  try {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId);
    if ((count ?? 0) > 0) return false;
    await supabase.from("chats").delete().eq("id", chatId);
    return true;
  } catch (e) {
    console.error("deleteChatIfEmpty failed", e);
    return false;
  }
}

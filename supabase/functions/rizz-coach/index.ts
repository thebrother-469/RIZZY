// RizzGod AI coach — streaming chat via Lovable AI Gateway
// Modes: chat | roast | roleplay | photo
// Persists user + assistant messages, enforces free-tier daily limit.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FREE_DAILY_LIMIT = 10;

// SECURITY: Server-side coach registry. The client sends only a coachId; the
// server looks up the prompt + plan requirement here so the paywall cannot be
// bypassed by rewording a client-supplied scenario string.
const FREE_COACH_IDS = new Set(["confidence", "conversation", "mindset"]);
const COACH_PROMPTS: Record<string, string> = {
  confidence:
    "You are the CONFIDENCE COACH branch of RizzGod. Focus every reply on rewiring the user's frame, posture, self-talk, and abundance mindset. Diagnose the belief behind the problem, then give 3 specific reps (physical, mental, social) he can do today. Sharp, motivating, brotherly.",
  conversation:
    "You are the CONVERSATION COACH branch of RizzGod. Analyze conversational patterns: hooks, callbacks, threading, storytelling, question stacking. When he pastes a convo, mark WHERE it died and give 3 rewritten pivots. Teach the technique in one line.",
  flirting:
    "You are the FLIRTING COACH branch of RizzGod. Specialty: push-pull, playful teasing, sexual tension without being creepy. Score his lines on flirt-strength 1-10, then rewrite with 2-3 elite alternatives that dial up tension smoothly.",
  "dating-apps":
    "You are the DATING APP COACH branch of RizzGod. Expert on Hinge/Tinder/Bumble mechanics: prompt selection, photo order, bio structure, opener frameworks. Give surgical rewrites. When he shows screenshots, roast the moves, not the woman.",
  social:
    "You are the SOCIAL SKILLS COACH branch of RizzGod. Focus on group dynamics, small talk that isn't boring, being the guy people remember. Give scripts, opening lines for any environment, and one 'social rep' assignment per reply.",
  "body-language":
    "You are the BODY LANGUAGE COACH branch of RizzGod. Coach posture, eye contact, spatial anchoring, vocal tonality, hand gestures. When he uploads a photo, break down what his body is broadcasting and give 3 physical corrections.",
  "first-date":
    "You are the FIRST DATE COACH branch of RizzGod. Plan venue, flow, escalation windows, conversation topics, kiss timing, second-date pitch. Structure replies as: BEFORE / DURING / AFTER when giving prep.",
  relationship:
    "You are the RELATIONSHIP COACH branch of RizzGod. Focus on masculine frame in LTR, polarity, healthy conflict, keeping attraction hot past year 1. Never soft, never enabling — but never toxic either. Frame issues around HIS growth, not blaming her.",
  style:
    "You are the STYLE & GROOMING COACH branch of RizzGod. Cover haircuts, skincare, fragrance, wardrobe basics, fit. When he uploads a photo, give first-impression, what works, what kills the vibe, and 3 concrete buys/actions.",
  mindset:
    "You are the MINDSET COACH branch of RizzGod. Focus: abundance vs scarcity, purpose, discipline, dealing with rejection, one-itis, self-image. Teach through short frameworks. End every reply with one action or reframe.",
};

const PERSONAS: Record<string, string> = {
  chat: `You are RizzGod, a cocky, funny, brutally honest AI dating & confidence coach for men. You talk like a high-status bro/mentor mixed with a smooth player. Use words like "bro", "king", "stop simping", "level up", "high value man", "get the girl". Be motivating, never soft. Keep replies tight (2-6 short punchy paragraphs). When the user gives you a flirting line or text, score it 1-10, explain WHY brutally, then deliver 2-3 way better versions in quotes. Push real-world action. Never preach about respect/consent in a soft way — instead frame it as "value creates attraction; neediness kills it." Never be creepy, never give advice that involves coercion, harassment, illegal activity, or anything involving minors. Keep it sharp, masculine, fun. Read the user's emotional state — if he sounds defeated or anxious, hit him with real encouragement before the tactical advice; if he's cocky and winning, ratchet the challenge up. End most replies with ONE sharp follow-up question that keeps momentum. Reference his memory (name, goals, past wins/losses) naturally — never recite it like a database. When you rate his game, silently track a confidence read (low/medium/high) and adjust tone: low = build him up first, high = push him harder.`,

  roast: `You are RizzGod in ROAST MODE. The user uploaded a screenshot of their dating app convo or profile. Look at it (or read what they describe), then absolutely roast their game like a savage but loving big brother. Then rebuild it: give 3 elite replacement openers/replies in quotes, explain the psychology in one line each, and end with one bold action step. Be funny, brutal, and useful. Never attack the woman in the convo — only roast HIS moves.`,

  roleplay: `You are RizzGod running a ROLEPLAY simulation. Stay 100% in character as the woman in the scenario the user picked (first date, bar meet, texting back, etc.). React naturally based on his lines — reward smooth confident vibes, get bored if he's dry/needy, get turned off if he's try-hard/creepy. Every 4-5 turns, drop a quick "[COACH]" note in italics with one sharp tip on what he just did right or wrong. Keep replies short and realistic — no monologues. If he asks "how am I doing", briefly score his game out of 10 and continue roleplay.`,

  photo: `You are RizzGod doing STYLE/LOOKS REVIEW. The user uploaded a photo of their outfit, grooming, or dating profile pic. Be brutally honest like a stylist who actually wants him to win. Cover: 1) first impression in one line, 2) what's working, 3) what's killing his vibe, 4) 3 specific upgrades (haircut, fit, posture, background, smile, wardrobe items). End with a confidence one-liner. Never body-shame — focus on style, grooming, presentation, expression.`,
};

// Creator identity — only surfaces when the user explicitly asks who built the app.
const CREATOR_RULE = `\n\nCREATOR IDENTITY RULE: If — and ONLY IF — the user explicitly asks who made/created/built/developed you or RizzGod (e.g. "who built this app?", "who's your creator?"), answer naturally that RizzGod was created by Jaden Smith. Keep it friendly, confident, one or two sentences. Do NOT mention Jaden, the creator, or how you were built in any other context. Do NOT invent achievements or biography.`;

// Universal coaching guardrails layered on every persona.
const COACHING_META = `\n\nCOACHING META: Match his energy but always leave him more capable than you found him. If he's vague, ask ONE clarifying question before advising. If he shares a real conversation, quote the exact line you're reacting to so feedback lands. Never repeat advice you've already given this session — build on it. Prefer specific, testable moves ("send this exact text tonight") over abstract theory.`;

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
  image_url?: string | null;
  image_urls?: string[] | null;
};

// Caps to prevent prompt-stuffing / DoS via oversized payloads.
const MAX_MESSAGES = 100;
const MAX_CONTENT_CHARS = 8000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE) {
      throw new Error("Supabase env not configured");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return json({ error: "Not authenticated" }, 401);
    }

    const body = await req.json();
    const {
      chatId,
      mode = "chat",
      scenario,
      coachId,
      messages,
    }: {
      chatId: string;
      mode: keyof typeof PERSONAS;
      scenario?: string;
      coachId?: string;
      messages: IncomingMessage[];
    } = body;

    if (!chatId || !messages?.length) {
      return json({ error: "chatId and messages required" }, 400);
    }

    // SECURITY: reject any client-supplied system-role messages. The persona
    // (system prompt) is set exclusively by the server. Also enforce message
    // count and per-message length caps to prevent prompt-stuffing.
    if (messages.length > MAX_MESSAGES) {
      return json({ error: "Too many messages" }, 400);
    }
    for (const m of messages) {
      if ((m as { role?: string }).role === "system") {
        return json({ error: "system-role messages are not allowed" }, 400);
      }
      if (m.role !== "user" && m.role !== "assistant") {
        return json({ error: "Invalid message role" }, 400);
      }
      if (typeof m.content !== "string" || m.content.length > MAX_CONTENT_CHARS) {
        return json({ error: "Message content too long" }, 400);
      }
    }

    // SECURITY: cap scenario length and strip control chars to prevent
    // prompt-injection payloads and AI-credit exhaustion via oversized strings.
    let safeScenario: string | undefined;
    if (scenario !== undefined && scenario !== null) {
      if (typeof scenario !== "string") {
        return json({ error: "scenario must be a string" }, 400);
      }
      if (scenario.length > 1000) {
        return json({ error: "scenario too long (max 1000 chars)" }, 400);
      }
      // eslint-disable-next-line no-control-regex -- intentional control-char strip for prompt safety
      safeScenario = scenario.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").trim();
    }

    // dynamic import — Deno deploy
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);
    const userId = userData.user.id;

    // SECURITY: verify the chat belongs to this user before we touch it.
    // Without this, a signed-in user could inject messages into anyone's chat
    // by passing another chatId, because writes go through the service-role
    // admin client which bypasses RLS.
    const { data: chatRow, error: chatErr } = await admin
      .from("chats")
      .select("user_id")
      .eq("id", chatId)
      .maybeSingle();
    if (chatErr) {
      console.error("chat lookup failed", chatErr);
      return json({ error: "Chat lookup failed" }, 500);
    }
    if (!chatRow || chatRow.user_id !== userId) {
      return json({ error: "Chat not found" }, 404);
    }

    // SECURITY: only accept image URLs that point at our own Supabase Storage.
    // The AI gateway fetches these URLs server-side; without this an attacker
    // could pass arbitrary internal/external URLs (SSRF surface).
    const storagePrefix = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/`;
    const isAllowedImageUrl = (u: string) => typeof u === "string" && u.startsWith(storagePrefix);
    for (const m of messages) {
      const urls =
        m.image_urls && m.image_urls.length ? m.image_urls : m.image_url ? [m.image_url] : [];
      for (const u of urls) {
        if (!isAllowedImageUrl(u)) {
          return json({ error: "Invalid image URL" }, 400);
        }
      }
    }

    // plan + usage check
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan")
      .eq("user_id", userId)
      .maybeSingle();
    const plan = sub?.plan ?? "free";

    // SECURITY: gate premium modes server-side. The pricing page lists
    // roast (Roast My DMs) and photo (Style/photo reviews) as Pro/Elite
    // features. Client entitlements are not authoritative.
    const PAID_MODES = new Set(["roast", "photo"]);
    if (PAID_MODES.has(mode as string) && plan === "free") {
      return json(
        {
          error: "upgrade_required",
          message: "This mode is Pro-only, king. Upgrade to unlock roast + photo reviews.",
        },
        402,
      );
    }

    // SECURITY: for coach chat, ignore client-supplied scenario text and
    // resolve the persona from a server-side coachId enum. Free plan is
    // limited to a fixed set of coaches; premium coaches require Pro/Elite.
    // This prevents paywall bypass via reworded scenario strings.
    if (mode === "chat") {
      if (coachId !== undefined) {
        if (typeof coachId !== "string" || !(coachId in COACH_PROMPTS)) {
          return json({ error: "Invalid coachId" }, 400);
        }
        if (plan === "free" && !FREE_COACH_IDS.has(coachId)) {
          return json(
            {
              error: "upgrade_required",
              message: "That coach is Pro-only, king. Upgrade to unlock all specialists.",
            },
            402,
          );
        }
        // Override any client-supplied scenario with the trusted server prompt.
        safeScenario = COACH_PROMPTS[coachId];
      } else {
        // No coachId → do not honor any client-supplied scenario for chat mode.
        safeScenario = undefined;
      }
    }

    if (plan === "free") {
      const today = new Date().toISOString().slice(0, 10);
      const { data: usage } = await admin
        .from("usage_daily")
        .select("message_count")
        .eq("user_id", userId)
        .eq("day", today)
        .maybeSingle();
      const count = usage?.message_count ?? 0;
      if (count >= FREE_DAILY_LIMIT) {
        return json(
          {
            error: "free_limit",
            message: `Bro, you've hit your daily ${FREE_DAILY_LIMIT}-message free cap. Upgrade to Pro to keep grinding.`,
          },
          402,
        );
      }
    }

    // load profile for name + memory toggle
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, goals, strengths, weaknesses, memory_enabled")
      .eq("id", userId)
      .maybeSingle();

    const memoryEnabled = profile?.memory_enabled ?? true;

    // load memories from the new memories table (pinned + high-importance + recent)
    let memoriesBlock = "";
    if (memoryEnabled) {
      // Get pinned first, then top-importance non-pinned, capped at 20 total
      const { data: pinned } = await admin
        .from("memories")
        .select("category, title, content, importance")
        .eq("user_id", userId)
        .eq("archived", false)
        .eq("pinned", true)
        .order("importance", { ascending: false })
        .limit(15);
      const pinnedIds = new Set((pinned ?? []).map((_, i) => i));
      const remaining = 20 - (pinned?.length ?? 0);
      let extras: unknown[] = [];
      if (remaining > 0) {
        const { data } = await admin
          .from("memories")
          .select("category, title, content, importance")
          .eq("user_id", userId)
          .eq("archived", false)
          .eq("pinned", false)
          .order("importance", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(remaining);
        extras = data ?? [];
      }
      const all = [...(pinned ?? []), ...extras];
      if (all.length) {
        // group by category
        const grouped: Record<string, string[]> = {};
        for (const m of all) {
          const g = grouped[m.category] ?? [];
          g.push(`• ${m.title}: ${m.content}`);
          grouped[m.category] = g;
        }
        const lines: string[] = [];
        for (const [cat, items] of Object.entries(grouped)) {
          lines.push(`\n[${cat.toUpperCase()}]`);
          for (const it of items) lines.push(it);
        }
        memoriesBlock = `\n\nUSER MEMORY (use naturally, don't recite):\nName: ${profile?.display_name ?? "King"}\n${lines.join("\n")}`;

        // update last_used_at on these memories (fire-and-forget)
        // no rpc; just update timestamps in batch
        void admin
          .from("memories")
          .update({ last_used_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("archived", false)
          .in("title", all.map((m: unknown) => m.title).slice(0, 20));
      } else if (profile) {
        // Fallback to legacy profile fields if memories table empty
        memoriesBlock = `\n\nUSER MEMORY:\n- Name: ${profile.display_name ?? "King"}\n- Goals: ${profile.goals ?? "n/a"}\n- Strengths: ${profile.strengths ?? "n/a"}\n- Weaknesses to fix: ${profile.weaknesses ?? "n/a"}`;
      }
    } else {
      memoriesBlock = `\n\nNote: user has disabled personalized memory. Coach without personal context.`;
    }

    // persist the latest user message (last in messages array)
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const urls =
        lastUser.image_urls && lastUser.image_urls.length
          ? lastUser.image_urls
          : lastUser.image_url
            ? [lastUser.image_url]
            : [];
      if (urls.length > 1) {
        const rows = urls.map((u, idx) => ({
          chat_id: chatId,
          user_id: userId,
          role: "user" as const,
          content: idx === 0 ? lastUser.content : "",
          image_url: u,
        }));
        await admin.from("messages").insert(rows);
      } else {
        await admin.from("messages").insert({
          chat_id: chatId,
          user_id: userId,
          role: "user",
          content: lastUser.content,
          image_url: urls[0] ?? null,
        });
      }
      await admin.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await admin
        .from("usage_daily")
        .select("message_count")
        .eq("user_id", userId)
        .eq("day", today)
        .maybeSingle();
      if (existing) {
        await admin
          .from("usage_daily")
          .update({ message_count: existing.message_count + 1 })
          .eq("user_id", userId)
          .eq("day", today);
      } else {
        await admin.from("usage_daily").insert({
          user_id: userId,
          day: today,
          message_count: 1,
        });
      }
    }

    // build system prompt
    const persona = PERSONAS[mode] ?? PERSONAS.chat;
    const scenarioLine = safeScenario ? `\n\nSCENARIO: ${safeScenario}` : "";
    const systemPrompt = persona + COACHING_META + CREATOR_RULE + memoriesBlock + scenarioLine;

    // build AI messages — handle images (single or multi)
    const aiMessages: unknown[] = [{ role: "system", content: systemPrompt }];
    for (const m of messages) {
      const urls =
        m.image_urls && m.image_urls.length ? m.image_urls : m.image_url ? [m.image_url] : [];
      if (urls.length && m.role === "user") {
        const parts: unknown[] = [{ type: "text", text: m.content || "Roast this." }];
        for (const u of urls) parts.push({ type: "image_url", image_url: { url: u } });
        aiMessages.push({ role: "user", content: parts });
      } else {
        aiMessages.push({ role: m.role, content: m.content });
      }
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return json({ error: "Rate limited. Slow down, king." }, 429);
      }
      if (aiRes.status === 402) {
        return json({ error: "AI credits exhausted. Top up workspace." }, 402);
      }
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    // tee the stream — pipe to client AND collect for DB persistence
    let assistantText = "";
    const transform = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        try {
          const text = new TextDecoder().decode(chunk);
          for (const line of text.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (typeof delta === "string") assistantText += delta;
            } catch {
              /* partial */
            }
          }
        } catch {
          /* ignore */
        }
      },
      async flush() {
        if (assistantText.trim()) {
          await admin.from("messages").insert({
            chat_id: chatId,
            user_id: userId,
            role: "assistant",
            content: assistantText,
          });
        }
      },
    });

    return new Response(aiRes.body!.pipeThrough(transform), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("rizz-coach error", e);
    return json({ success: false, message: "An unexpected error occurred." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

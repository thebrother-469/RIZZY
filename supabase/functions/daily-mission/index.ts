// Generates a fresh daily mission tailored to the user
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON =
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return j({ error: "Not authenticated" }, 401);

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.0");
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return j({ error: "Invalid session" }, 401);
    const userId = u.user.id;

    const today = new Date().toISOString().slice(0, 10);

    // already have today's mission?
    const { data: existing } = await admin
      .from("missions")
      .select("*")
      .eq("user_id", userId)
      .eq("assigned_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return j({ mission: existing });

    const { data: profile } = await admin
      .from("profiles")
      .select("display_name, goals, weaknesses")
      .eq("id", userId)
      .maybeSingle();

    const sysPrompt = `You are RizzGod, a brutally honest dating & confidence coach. Generate ONE real-world mission for today that pushes a man out of his comfort zone to build real confidence with women. The mission must be doable in <24h, legal, respectful, and force action (not theory). Match the difficulty: easy/medium/hard. Output STRICT JSON only:
{"title":"<6 word punchy title>","description":"<2-3 sentence specific challenge with concrete action>","difficulty":"easy|medium|hard"}
Context — Goals: ${profile?.goals ?? "general improvement"}. Weak spots: ${profile?.weaknesses ?? "approach anxiety"}.`;

    if (!LOVABLE_API_KEY) {
      console.error("[daily-mission] LOVABLE_API_KEY missing");
      return j({ error: "AI not configured" }, 500);
    }
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: "Give me today's mission." },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("[daily-mission] AI gateway error", aiRes.status, t);
      if (aiRes.status === 429) return j({ error: "Rate limited, try again shortly." }, 429);
      if (aiRes.status === 402) return j({ error: "AI credits exhausted." }, 402);
      return j({ error: `AI error (${aiRes.status})` }, 500);
    }
    const ai = await aiRes.json();
    const raw = ai.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        title: "Talk to 3 strangers today",
        description: raw.slice(0, 200),
        difficulty: "medium",
      };
    }

    const { data: inserted, error } = await admin
      .from("missions")
      .insert({
        user_id: userId,
        title: parsed.title || "Daily mission",
        description: parsed.description || "Take action.",
        difficulty: parsed.difficulty || "medium",
        assigned_date: today,
      })
      .select()
      .single();
    if (error) {
      console.error("[daily-mission] insert failed", error);
      return j({ error: "Failed to save mission, try again." }, 500);
    }

    return j({ mission: inserted });
  } catch (e) {
    console.error("daily-mission error", e);
    return j({ success: false, message: "An unexpected error occurred." }, 500);
  }
});
function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

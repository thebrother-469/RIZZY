import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_my_stats",
  title: "Get my stats",
  description:
    "Get the signed-in user's RizzGod stats: total XP, level, current streak, and longest streak.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    const [xpRes, streakRes] = await Promise.all([
      sb
        .from("user_xp")
        .select("total_xp, level, xp_into_level")
        .eq("user_id", userId)
        .maybeSingle(),
      sb
        .from("streaks")
        .select("current_streak, longest_streak, last_action_date")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (xpRes.error)
      return { content: [{ type: "text", text: xpRes.error.message }], isError: true };
    if (streakRes.error)
      return { content: [{ type: "text", text: streakRes.error.message }], isError: true };
    const stats = {
      total_xp: xpRes.data?.total_xp ?? 0,
      level: xpRes.data?.level ?? 1,
      xp_into_level: xpRes.data?.xp_into_level ?? 0,
      current_streak: streakRes.data?.current_streak ?? 0,
      longest_streak: streakRes.data?.longest_streak ?? 0,
      last_action_date: streakRes.data?.last_action_date ?? null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(stats) }],
      structuredContent: stats,
    };
  },
});

import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_my_missions",
  title: "List my missions",
  description:
    "List the signed-in user's RizzGod missions. Defaults to today; pass `all: true` to list every mission.",
  inputSchema: {
    all: z.boolean().optional().describe("If true, return all missions instead of today's only."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ all }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("missions")
      .select("id, title, description, difficulty, assigned_date, completed, completed_at")
      .eq("user_id", ctx.getUserId())
      .order("assigned_date", { ascending: false })
      .limit(50);
    if (!all) {
      const today = new Date().toISOString().slice(0, 10);
      q = q.eq("assigned_date", today);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { missions: data ?? [] },
    };
  },
});

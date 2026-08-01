import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyStats from "./tools/get-my-stats";
import listMyMissions from "./tools/list-my-missions";
import listCoaches from "./tools/list-coaches";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "rizzgod-mcp",
  title: "RizzGod",
  version: "0.1.0",
  instructions:
    "Tools for RizzGod. Use `list_coaches` for the public coach roster. Use `get_my_stats` and `list_my_missions` to read the signed-in user's XP, streak, and daily missions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCoaches, getMyStats, listMyMissions],
});

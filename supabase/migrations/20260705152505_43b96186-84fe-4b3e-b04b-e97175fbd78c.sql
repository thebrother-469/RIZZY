-- Revoke public/anon execute on ALL SECURITY DEFINER helpers.
-- handle_new_user REVOKE moved to later migration to ensure function exists first
REVOKE ALL ON FUNCTION public.subscriptions_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.award_xp(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_badge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_mission(uuid) FROM PUBLIC, anon;

-- Keep the three user-facing RPCs callable by signed-in users; internal
-- auth.uid() and ownership gates continue to enforce per-user safety.
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated;

-- service_role keeps full access for server-side callers.
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.subscriptions_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

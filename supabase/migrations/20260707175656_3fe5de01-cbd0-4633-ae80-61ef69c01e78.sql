
-- handle_new_user REVOKE moved to later migration to ensure function exists first
REVOKE ALL ON FUNCTION public.subscriptions_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.award_xp(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_badge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_mission(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated;


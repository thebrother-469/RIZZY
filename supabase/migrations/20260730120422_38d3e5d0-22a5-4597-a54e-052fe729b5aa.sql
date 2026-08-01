-- Revoke direct API execution of SECURITY DEFINER functions.
-- All app usage goes through server functions using the service_role client.

REVOKE ALL ON FUNCTION public.award_xp(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.award_badge(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_badge(text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.complete_mission(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.consume_profile_gen_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_profile_gen_quota(integer, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_profile_gen_usage_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_gen_usage_today(uuid) TO service_role;

-- Trigger / maintenance helpers: never callable directly by clients.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_memory_cap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_plan_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_onboarding_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

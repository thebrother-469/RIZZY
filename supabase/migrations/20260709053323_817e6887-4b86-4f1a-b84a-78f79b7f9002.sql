REVOKE EXECUTE ON FUNCTION public.award_xp(text, jsonb, uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.award_badge(text, uuid) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid, uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_badge(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, uuid) TO service_role;
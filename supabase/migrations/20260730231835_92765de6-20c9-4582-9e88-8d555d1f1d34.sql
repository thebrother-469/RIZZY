-- Revoke blanket anon access on all public tables
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- Re-grant authenticated privileges matching existing RLS policies
GRANT SELECT ON public.auth_audit_logs TO authenticated;
GRANT SELECT ON public.badges TO authenticated;
GRANT SELECT ON public.daily_mission_debug_events TO authenticated;
GRANT SELECT ON public.onboarding_debug_events TO authenticated;
GRANT SELECT ON public.profile_gen_usage TO authenticated;
GRANT SELECT ON public.streaks TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.usage_daily TO authenticated;
GRANT SELECT ON public.user_xp TO authenticated;
GRANT SELECT ON public.xp_events TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memories TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Service role retains full access everywhere
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Keep future tables from being auto-exposed to anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
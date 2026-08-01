
-- 1. Revoke EXECUTE on all SECURITY DEFINER functions from anon/authenticated/PUBLIC.
-- handle_new_user REVOKE moved to later migration to ensure function exists first
REVOKE EXECUTE ON FUNCTION public.award_xp(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_badge(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_badge(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, uuid) TO service_role;

-- 2. missions: owner INSERT/UPDATE policies.
DROP POLICY IF EXISTS "Users insert own missions" ON public.missions;
CREATE POLICY "Users insert own missions" ON public.missions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own missions" ON public.missions;
CREATE POLICY "Users update own missions" ON public.missions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. streaks / usage_daily / user_xp / xp_events: owner INSERT + UPDATE policies.
DROP POLICY IF EXISTS "Users insert own streaks" ON public.streaks;
CREATE POLICY "Users insert own streaks" ON public.streaks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own streaks" ON public.streaks;
CREATE POLICY "Users update own streaks" ON public.streaks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own usage_daily" ON public.usage_daily;
CREATE POLICY "Users insert own usage_daily" ON public.usage_daily
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own usage_daily" ON public.usage_daily;
CREATE POLICY "Users update own usage_daily" ON public.usage_daily
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own user_xp" ON public.user_xp;
CREATE POLICY "Users insert own user_xp" ON public.user_xp
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own user_xp" ON public.user_xp;
CREATE POLICY "Users update own user_xp" ON public.user_xp
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own xp_events" ON public.xp_events;
CREATE POLICY "Users insert own xp_events" ON public.xp_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 4. paddle_webhook_events: explicit service-role-only policy.
DROP POLICY IF EXISTS "Service role only" ON public.paddle_webhook_events;
CREATE POLICY "Service role only" ON public.paddle_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. database_export_07_07_26 storage bucket: explicit deny for anon/authenticated.
DROP POLICY IF EXISTS "database_export deny anon" ON storage.objects;
CREATE POLICY "database_export deny anon" ON storage.objects
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'database_export_07_07_26')
  WITH CHECK (bucket_id <> 'database_export_07_07_26');


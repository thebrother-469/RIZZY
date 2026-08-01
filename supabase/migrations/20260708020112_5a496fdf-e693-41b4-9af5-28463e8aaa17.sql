
-- 1) Storage: add restrictive service-role-only policy for export buckets
CREATE POLICY "export buckets service role only"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO public
USING (
  bucket_id NOT IN ('database_export_07_07_26','database_export_08_07_26')
  OR (auth.jwt() ->> 'role') = 'service_role'
)
WITH CHECK (
  bucket_id NOT IN ('database_export_07_07_26','database_export_08_07_26')
  OR (auth.jwt() ->> 'role') = 'service_role'
);

-- 2) usage_daily: SELECT-only for authenticated; all writes via service role in edge fn
DROP POLICY IF EXISTS "own usage" ON public.usage_daily;
CREATE POLICY "own usage read"
ON public.usage_daily
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3) Gamification tables: SELECT-only for authenticated
DROP POLICY IF EXISTS "own xp" ON public.user_xp;
CREATE POLICY "own xp read"
ON public.user_xp
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own xp events" ON public.xp_events;
CREATE POLICY "own xp events read"
ON public.xp_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own badges" ON public.badges;
CREATE POLICY "own badges read"
ON public.badges
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own streak" ON public.streaks;
CREATE POLICY "own streak read"
ON public.streaks
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4) missions: allow SELECT + INSERT of own rows; forbid UPDATE/DELETE
--    (completion must go through public.complete_mission SECURITY DEFINER function)
DROP POLICY IF EXISTS "own missions" ON public.missions;
CREATE POLICY "own missions read"
ON public.missions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "own missions insert"
ON public.missions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND completed = false AND completed_at IS NULL);

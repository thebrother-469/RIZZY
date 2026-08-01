
-- Recreate xp_events policies with explicit TO authenticated so the linter
-- no longer flags anonymous exposure. Behaviour is unchanged: anonymous
-- users could never satisfy auth.uid() = user_id, but the linter matches on
-- the absence of a TO clause.
DROP POLICY IF EXISTS "own xp events read" ON public.xp_events;
DROP POLICY IF EXISTS "Block client updates on xp_events" ON public.xp_events;
DROP POLICY IF EXISTS "Block client deletes on xp_events" ON public.xp_events;
DROP POLICY IF EXISTS "Block client inserts on xp_events" ON public.xp_events;

CREATE POLICY "own xp events read"
  ON public.xp_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Block client inserts on xp_events"
  ON public.xp_events
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block client updates on xp_events"
  ON public.xp_events
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Block client deletes on xp_events"
  ON public.xp_events
  FOR DELETE
  TO authenticated
  USING (false);

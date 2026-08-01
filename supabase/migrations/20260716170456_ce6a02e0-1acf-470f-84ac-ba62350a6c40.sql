
DROP POLICY IF EXISTS "Block client deletes on xp_events" ON public.xp_events;
DROP POLICY IF EXISTS "Block client inserts on xp_events" ON public.xp_events;
DROP POLICY IF EXISTS "Block client updates on xp_events" ON public.xp_events;

CREATE POLICY "Block client deletes on xp_events" ON public.xp_events
  FOR DELETE TO authenticated USING (false);
CREATE POLICY "Block client inserts on xp_events" ON public.xp_events
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "Block client updates on xp_events" ON public.xp_events
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

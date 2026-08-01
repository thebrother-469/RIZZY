DROP POLICY IF EXISTS "service role only" ON public.paddle_webhook_events;
CREATE POLICY "service role only" ON public.paddle_webhook_events
FOR ALL TO service_role USING (true) WITH CHECK (true);
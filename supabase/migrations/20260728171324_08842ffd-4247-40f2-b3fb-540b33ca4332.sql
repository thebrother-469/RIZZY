
CREATE TABLE public.onboarding_debug_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  correlation_id uuid NOT NULL,
  user_id uuid,
  event_name text NOT NULL,
  subsystem text NOT NULL DEFAULT 'onboarding',
  severity text NOT NULL DEFAULT 'info',
  success boolean,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onboarding_debug_events TO authenticated;
GRANT ALL ON public.onboarding_debug_events TO service_role;
ALTER TABLE public.onboarding_debug_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own onboarding debug read"
  ON public.onboarding_debug_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "block client insert onboarding debug"
  ON public.onboarding_debug_events FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "block client update onboarding debug"
  ON public.onboarding_debug_events FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "block client delete onboarding debug"
  ON public.onboarding_debug_events FOR DELETE TO authenticated USING (false);
CREATE INDEX onboarding_debug_events_corr_idx ON public.onboarding_debug_events (correlation_id);
CREATE INDEX onboarding_debug_events_user_idx ON public.onboarding_debug_events (user_id, created_at DESC);
CREATE INDEX onboarding_debug_events_created_idx ON public.onboarding_debug_events (created_at DESC);

CREATE TABLE public.daily_mission_debug_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  correlation_id uuid NOT NULL,
  user_id uuid,
  event_name text NOT NULL,
  subsystem text NOT NULL DEFAULT 'daily_mission',
  severity text NOT NULL DEFAULT 'info',
  success boolean,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.daily_mission_debug_events TO authenticated;
GRANT ALL ON public.daily_mission_debug_events TO service_role;
ALTER TABLE public.daily_mission_debug_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own daily mission debug read"
  ON public.daily_mission_debug_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "block client insert daily mission debug"
  ON public.daily_mission_debug_events FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "block client update daily mission debug"
  ON public.daily_mission_debug_events FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "block client delete daily mission debug"
  ON public.daily_mission_debug_events FOR DELETE TO authenticated USING (false);
CREATE INDEX daily_mission_debug_events_corr_idx ON public.daily_mission_debug_events (correlation_id);
CREATE INDEX daily_mission_debug_events_user_idx ON public.daily_mission_debug_events (user_id, created_at DESC);
CREATE INDEX daily_mission_debug_events_created_idx ON public.daily_mission_debug_events (created_at DESC);

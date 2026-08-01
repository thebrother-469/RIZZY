
-- 1) Atomic quota consumption RPC for profile generator.
-- Returns the new count on success, raises an exception with a structured
-- payload when the cap is exceeded. Prevents race conditions on double-clicks
-- / parallel requests by doing check + increment in a single INSERT ... ON
-- CONFLICT DO UPDATE, gated by a WHERE inside DO UPDATE.
CREATE OR REPLACE FUNCTION public.consume_profile_gen_quota(_cap integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _row public.profile_gen_usage;
  _used integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Unlimited plan: record for observability, never block.
  IF _cap IS NULL OR _cap <= 0 THEN
    INSERT INTO public.profile_gen_usage (user_id, day, count, updated_at)
    VALUES (_uid, _today, 1, now())
    ON CONFLICT (user_id, day) DO UPDATE
      SET count = public.profile_gen_usage.count + 1,
          updated_at = now()
    RETURNING * INTO _row;
    RETURN jsonb_build_object('used', _row.count, 'limit', NULL, 'remaining', NULL);
  END IF;

  -- Atomic conditional increment. If cap is already reached, DO UPDATE
  -- WHERE fails to match and RETURNING yields no row => we RAISE.
  INSERT INTO public.profile_gen_usage (user_id, day, count, updated_at)
  VALUES (_uid, _today, 1, now())
  ON CONFLICT (user_id, day) DO UPDATE
    SET count = public.profile_gen_usage.count + 1,
        updated_at = now()
    WHERE public.profile_gen_usage.count < _cap
  RETURNING * INTO _row;

  IF _row.user_id IS NULL THEN
    SELECT count INTO _used FROM public.profile_gen_usage
     WHERE user_id = _uid AND day = _today;
    RAISE EXCEPTION 'profile_gen_limit_reached'
      USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'used_today', COALESCE(_used, _cap),
              'limit', _cap,
              'remaining', 0
            )::text;
  END IF;

  RETURN jsonb_build_object(
    'used', _row.count,
    'limit', _cap,
    'remaining', GREATEST(0, _cap - _row.count)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_profile_gen_quota(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_profile_gen_quota(integer) TO authenticated, service_role;

-- Read-only helper for the account usage panel.
CREATE OR REPLACE FUNCTION public.get_profile_gen_usage_today()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT count INTO _used FROM public.profile_gen_usage
   WHERE user_id = _uid AND day = _today;
  RETURN jsonb_build_object('used', COALESCE(_used, 0), 'day', _today);
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_gen_usage_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_gen_usage_today() TO authenticated, service_role;

-- 2) auth_audit_logs: server-recorded auth events for observability.
-- Users can only read their own rows; only service_role can write.
CREATE TABLE IF NOT EXISTS public.auth_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type    text NOT NULL,
  result        text NOT NULL CHECK (result IN ('success','failure')),
  request_id    text,
  trace_id      text,
  ip_hash       text,
  user_agent    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auth_audit_logs TO authenticated;
GRANT ALL   ON public.auth_audit_logs TO service_role;

ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_audit_owner_select" ON public.auth_audit_logs;
CREATE POLICY "auth_audit_owner_select"
  ON public.auth_audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies for authenticated => writes go through
-- service_role only (server-side).
CREATE INDEX IF NOT EXISTS auth_audit_logs_user_created_idx
  ON public.auth_audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_audit_logs_event_created_idx
  ON public.auth_audit_logs (event_type, created_at DESC);

-- 3) Daily profile-usage cleanup via pg_cron.
-- The quota is already keyed by (user_id, day), so no "reset" is needed —
-- a new day = a new row. We only need to trim old rows to keep the table small.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Idempotent unschedule then schedule.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'profile_gen_usage_cleanup') THEN
    PERFORM cron.unschedule('profile_gen_usage_cleanup');
  END IF;
END $$;

SELECT cron.schedule(
  'profile_gen_usage_cleanup',
  '5 0 * * *', -- 00:05 UTC daily
  $cron$
    DELETE FROM public.profile_gen_usage
     WHERE day < ((now() AT TIME ZONE 'utc')::date - INTERVAL '90 days');
  $cron$
);

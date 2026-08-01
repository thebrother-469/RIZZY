-- Restrict profile-generation quota RPCs to trusted server-side callers only.
-- The old authenticated-callable signatures are removed so Supabase's exposed
-- API roles can no longer execute SECURITY DEFINER helpers directly.

DROP FUNCTION IF EXISTS public.consume_profile_gen_quota(integer);
DROP FUNCTION IF EXISTS public.get_profile_gen_usage_today();

CREATE OR REPLACE FUNCTION public.consume_profile_gen_quota(
  _cap integer,
  _caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := current_setting('request.jwt.claim.role', true);
  _uid uuid := COALESCE(auth.uid(), _caller_id);
  _today date := (now() AT TIME ZONE 'utc')::date;
  _row public.profile_gen_usage;
  _used integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _caller_id IS NOT NULL AND COALESCE(_role, '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.get_profile_gen_usage_today(
  _caller_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text := current_setting('request.jwt.claim.role', true);
  _uid uuid := COALESCE(auth.uid(), _caller_id);
  _today date := (now() AT TIME ZONE 'utc')::date;
  _used integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _caller_id IS NOT NULL AND COALESCE(_role, '') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count INTO _used FROM public.profile_gen_usage
   WHERE user_id = _uid AND day = _today;
  RETURN jsonb_build_object('used', COALESCE(_used, 0), 'day', _today);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_profile_gen_quota(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_profile_gen_usage_today(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_profile_gen_quota(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_profile_gen_usage_today(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_mission(_mission_id uuid, _caller_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _caller_id);
  _today date := (now() AT TIME ZONE 'utc')::date;
  _yesterday date := _today - 1;
  _owner uuid;
  _already_completed boolean;
  _last date; _cur int; _lng int; _new_cur int; _new_lng int;
  _advanced boolean := false; _updated int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _mission_id IS NULL THEN
    RAISE EXCEPTION 'mission_id is required' USING ERRCODE = '22023';
  END IF;

  -- Row lock: prevents concurrent double-completion and atomically proves existence.
  SELECT user_id, completed
    INTO _owner, _already_completed
    FROM public.missions
   WHERE id = _mission_id
   FOR UPDATE;

  IF _owner IS NULL THEN
    RAISE EXCEPTION 'mission not found' USING ERRCODE = 'P0002';
  END IF;

  IF _owner IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'forbidden: mission does not belong to caller' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: already-completed missions never trigger new side effects.
  IF _already_completed THEN
    SELECT COALESCE(current_streak, 0), COALESCE(longest_streak, 0)
      INTO _new_cur, _new_lng
      FROM public.streaks WHERE user_id = _uid;
    RETURN jsonb_build_object(
      'updated', false,
      'current_streak', COALESCE(_new_cur, 0),
      'longest_streak', COALESCE(_new_lng, 0),
      'streak_advanced', false
    );
  END IF;

  UPDATE public.missions
     SET completed = true, completed_at = now()
   WHERE id = _mission_id AND user_id = _uid AND completed = false;
  GET DIAGNOSTICS _updated = ROW_COUNT;

  SELECT last_action_date, current_streak, longest_streak INTO _last, _cur, _lng
    FROM public.streaks WHERE user_id = _uid;
  _cur := COALESCE(_cur, 0);
  _lng := COALESCE(_lng, 0);
  _new_cur := _cur;
  _new_lng := _lng;

  IF _updated > 0 THEN
    IF _last = _today THEN
      _new_cur := _cur;
    ELSIF _last = _yesterday THEN
      _new_cur := _cur + 1;
      _advanced := true;
    ELSE
      _new_cur := 1;
      _advanced := true;
    END IF;
    _new_lng := GREATEST(_new_cur, _lng);

    INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_action_date, updated_at)
    VALUES (_uid, _new_cur, _new_lng, _today, now())
    ON CONFLICT (user_id) DO UPDATE
      SET current_streak = EXCLUDED.current_streak,
          longest_streak = EXCLUDED.longest_streak,
          last_action_date = EXCLUDED.last_action_date,
          updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'updated', _updated > 0,
    'current_streak', _new_cur,
    'longest_streak', _new_lng,
    'streak_advanced', _advanced
  );
END;
$function$;

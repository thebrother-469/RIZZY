
-- Harden award_xp and award_badge against client-side farming.
-- Preserves all existing signatures and event/badge keys; only adds server-side
-- gating that verifies the underlying state before granting XP or a badge.

CREATE OR REPLACE FUNCTION public.award_xp(_event_type text, _meta jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _delta int;
  _current int;
  _new_total int;
  _level int := 1;
  _cumulative int := 0;
  _needed int;
  _into int;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _mission_id uuid;
  _is_service boolean := (current_setting('role', true) = 'service_role');
BEGIN
  IF _uid IS NULL AND NOT _is_service THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  _delta := CASE _event_type
    WHEN 'mission_completed' THEN 50
    WHEN 'streak_day' THEN 10
    WHEN 'chat_message' THEN 2
    WHEN 'roast_completed' THEN 15
    WHEN 'roleplay_session' THEN 20
    WHEN 'memory_created' THEN 5
    WHEN 'onboarding_complete' THEN 100
    ELSE NULL
  END;
  IF _delta IS NULL THEN
    RAISE EXCEPTION 'invalid event_type' USING ERRCODE = '22023';
  END IF;

  -- Server-side abuse gates. Bypassed when called with service_role.
  IF NOT _is_service THEN
    IF _event_type = 'mission_completed' THEN
      -- Requires a real completed mission belonging to caller,
      -- and no prior XP event already granted for that mission.
      BEGIN
        _mission_id := (_meta->>'mission_id')::uuid;
      EXCEPTION WHEN OTHERS THEN _mission_id := NULL;
      END;
      IF _mission_id IS NULL THEN RETURN NULL; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.missions
         WHERE id = _mission_id AND user_id = _uid AND completed = true
      ) THEN
        RETURN NULL;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.xp_events
         WHERE user_id = _uid
           AND event_type = 'mission_completed'
           AND (meta->>'mission_id') = _mission_id::text
      ) THEN
        RETURN NULL;
      END IF;

    ELSIF _event_type = 'streak_day' THEN
      -- Once per UTC day and only if streak actually advanced today.
      IF NOT EXISTS (
        SELECT 1 FROM public.streaks
         WHERE user_id = _uid AND last_action_date = _today
      ) THEN
        RETURN NULL;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.xp_events
         WHERE user_id = _uid
           AND event_type = 'streak_day'
           AND created_at >= _today
      ) THEN
        RETURN NULL;
      END IF;

    ELSIF _event_type = 'onboarding_complete' THEN
      -- Only after onboarding is actually recorded, and only once.
      IF NOT EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = _uid AND onboarded_at IS NOT NULL
      ) THEN
        RETURN NULL;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.xp_events
         WHERE user_id = _uid AND event_type = 'onboarding_complete'
      ) THEN
        RETURN NULL;
      END IF;

    ELSE
      -- chat_message / roast_completed / roleplay_session / memory_created
      -- are not called from the client today. Restrict them to service_role
      -- so future server code can grant them, but end-users cannot farm.
      RETURN NULL;
    END IF;
  END IF;

  SELECT COALESCE(total_xp, 0) INTO _current FROM public.user_xp WHERE user_id = _uid;
  _current := COALESCE(_current, 0);
  _new_total := _current + _delta;

  LOOP
    _needed := 100 * _level;
    EXIT WHEN _cumulative + _needed > _new_total OR _level > 500;
    _cumulative := _cumulative + _needed;
    _level := _level + 1;
  END LOOP;
  _into := _new_total - _cumulative;

  INSERT INTO public.user_xp (user_id, total_xp, level, xp_into_level, updated_at)
  VALUES (_uid, _new_total, _level, _into, now())
  ON CONFLICT (user_id) DO UPDATE
    SET total_xp = EXCLUDED.total_xp,
        level = EXCLUDED.level,
        xp_into_level = EXCLUDED.xp_into_level,
        updated_at = now();

  INSERT INTO public.xp_events (user_id, event_type, xp_delta, meta)
  VALUES (_uid, _event_type, _delta, _meta);

  RETURN jsonb_build_object('delta', _delta, 'newTotal', _new_total, 'level', _level);
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_badge(_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.badges;
  _ok boolean := false;
  _is_service boolean := (current_setting('role', true) = 'service_role');
BEGIN
  IF _uid IS NULL AND NOT _is_service THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _key NOT IN ('first_mission','streak_3','streak_7','streak_30','level_5','level_10','first_roast','memory_master') THEN
    RAISE EXCEPTION 'invalid badge key' USING ERRCODE = '22023';
  END IF;

  IF _is_service THEN
    _ok := true;
  ELSE
    -- Verify real state before granting each badge.
    IF _key = 'first_mission' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.missions
         WHERE user_id = _uid AND completed = true
      ) INTO _ok;
    ELSIF _key = 'streak_3' THEN
      SELECT COALESCE(longest_streak, 0) >= 3 FROM public.streaks WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'streak_7' THEN
      SELECT COALESCE(longest_streak, 0) >= 7 FROM public.streaks WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'streak_30' THEN
      SELECT COALESCE(longest_streak, 0) >= 30 FROM public.streaks WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'level_5' THEN
      SELECT COALESCE(level, 1) >= 5 FROM public.user_xp WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'level_10' THEN
      SELECT COALESCE(level, 1) >= 10 FROM public.user_xp WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'memory_master' THEN
      SELECT (COUNT(*) >= 10) FROM public.memories WHERE user_id = _uid AND pinned = true INTO _ok;
    ELSIF _key = 'first_roast' THEN
      -- Awarded when the user has at least one chat in roast mode with a message.
      SELECT EXISTS (
        SELECT 1 FROM public.chats c
         WHERE c.user_id = _uid AND c.mode = 'roast'
           AND EXISTS (SELECT 1 FROM public.messages m WHERE m.chat_id = c.id AND m.role = 'user')
      ) INTO _ok;
    END IF;
  END IF;

  IF NOT COALESCE(_ok, false) THEN RETURN NULL; END IF;

  INSERT INTO public.badges (user_id, badge_key) VALUES (_uid, _key)
  ON CONFLICT DO NOTHING RETURNING * INTO _row;
  IF _row.id IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(_row);
END;
$function$;

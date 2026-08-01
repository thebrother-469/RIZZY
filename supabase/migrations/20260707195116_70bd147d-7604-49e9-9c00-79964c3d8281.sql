
DROP FUNCTION IF EXISTS public.award_xp(text, jsonb);
DROP FUNCTION IF EXISTS public.award_badge(text);
DROP FUNCTION IF EXISTS public.complete_mission(uuid);

CREATE OR REPLACE FUNCTION public.award_xp(_event_type text, _meta jsonb DEFAULT NULL, _caller_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _caller_id);
  _delta int; _current int; _new_total int;
  _level int := 1; _cumulative int := 0; _needed int; _into int;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _mission_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  _delta := CASE _event_type
    WHEN 'mission_completed' THEN 50 WHEN 'streak_day' THEN 10 WHEN 'chat_message' THEN 2
    WHEN 'roast_completed' THEN 15 WHEN 'roleplay_session' THEN 20
    WHEN 'memory_created' THEN 5 WHEN 'onboarding_complete' THEN 100 ELSE NULL END;
  IF _delta IS NULL THEN RAISE EXCEPTION 'invalid event_type' USING ERRCODE = '22023'; END IF;

  IF _event_type = 'mission_completed' THEN
    BEGIN _mission_id := (_meta->>'mission_id')::uuid;
    EXCEPTION WHEN OTHERS THEN _mission_id := NULL; END;
    IF _mission_id IS NULL THEN RETURN NULL; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.missions WHERE id = _mission_id AND user_id = _uid AND completed = true) THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.xp_events WHERE user_id = _uid AND event_type = 'mission_completed' AND (meta->>'mission_id') = _mission_id::text) THEN RETURN NULL; END IF;
  ELSIF _event_type = 'streak_day' THEN
    IF NOT EXISTS (SELECT 1 FROM public.streaks WHERE user_id = _uid AND last_action_date = _today) THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.xp_events WHERE user_id = _uid AND event_type = 'streak_day' AND created_at >= _today) THEN RETURN NULL; END IF;
  ELSIF _event_type = 'onboarding_complete' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND onboarded_at IS NOT NULL) THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM public.xp_events WHERE user_id = _uid AND event_type = 'onboarding_complete') THEN RETURN NULL; END IF;
  ELSE
    RETURN NULL;
  END IF;

  SELECT COALESCE(total_xp, 0) INTO _current FROM public.user_xp WHERE user_id = _uid;
  _current := COALESCE(_current, 0); _new_total := _current + _delta;
  LOOP _needed := 100 * _level;
    EXIT WHEN _cumulative + _needed > _new_total OR _level > 500;
    _cumulative := _cumulative + _needed; _level := _level + 1;
  END LOOP;
  _into := _new_total - _cumulative;
  INSERT INTO public.user_xp (user_id, total_xp, level, xp_into_level, updated_at)
  VALUES (_uid, _new_total, _level, _into, now())
  ON CONFLICT (user_id) DO UPDATE SET total_xp = EXCLUDED.total_xp, level = EXCLUDED.level, xp_into_level = EXCLUDED.xp_into_level, updated_at = now();
  INSERT INTO public.xp_events (user_id, event_type, xp_delta, meta) VALUES (_uid, _event_type, _delta, _meta);
  RETURN jsonb_build_object('delta', _delta, 'newTotal', _new_total, 'level', _level);
END; $function$;

CREATE OR REPLACE FUNCTION public.award_badge(_key text, _caller_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _caller_id);
  _row public.badges; _ok boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _key NOT IN ('first_mission','streak_3','streak_7','streak_30','level_5','level_10','first_roast','memory_master') THEN
    RAISE EXCEPTION 'invalid badge key' USING ERRCODE = '22023';
  END IF;
  IF _key = 'first_mission' THEN SELECT EXISTS (SELECT 1 FROM public.missions WHERE user_id = _uid AND completed = true) INTO _ok;
  ELSIF _key = 'streak_3' THEN SELECT COALESCE(longest_streak, 0) >= 3 FROM public.streaks WHERE user_id = _uid INTO _ok;
  ELSIF _key = 'streak_7' THEN SELECT COALESCE(longest_streak, 0) >= 7 FROM public.streaks WHERE user_id = _uid INTO _ok;
  ELSIF _key = 'streak_30' THEN SELECT COALESCE(longest_streak, 0) >= 30 FROM public.streaks WHERE user_id = _uid INTO _ok;
  ELSIF _key = 'level_5' THEN SELECT COALESCE(level, 1) >= 5 FROM public.user_xp WHERE user_id = _uid INTO _ok;
  ELSIF _key = 'level_10' THEN SELECT COALESCE(level, 1) >= 10 FROM public.user_xp WHERE user_id = _uid INTO _ok;
  ELSIF _key = 'memory_master' THEN SELECT (COUNT(*) >= 10) FROM public.memories WHERE user_id = _uid AND pinned = true INTO _ok;
  ELSIF _key = 'first_roast' THEN SELECT EXISTS (SELECT 1 FROM public.chats c WHERE c.user_id = _uid AND c.mode = 'roast' AND EXISTS (SELECT 1 FROM public.messages m WHERE m.chat_id = c.id AND m.role = 'user')) INTO _ok;
  END IF;
  IF NOT COALESCE(_ok, false) THEN RETURN NULL; END IF;
  INSERT INTO public.badges (user_id, badge_key) VALUES (_uid, _key)
  ON CONFLICT DO NOTHING RETURNING * INTO _row;
  IF _row.id IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(_row);
END; $function$;

CREATE OR REPLACE FUNCTION public.complete_mission(_mission_id uuid, _caller_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := COALESCE(auth.uid(), _caller_id);
  _today date := (now() AT TIME ZONE 'utc')::date;
  _yesterday date := _today - 1;
  _last date; _cur int; _lng int; _new_cur int; _new_lng int;
  _advanced boolean := false; _updated int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.missions SET completed = true, completed_at = now()
   WHERE id = _mission_id AND user_id = _uid AND completed = false;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  SELECT last_action_date, current_streak, longest_streak INTO _last, _cur, _lng
    FROM public.streaks WHERE user_id = _uid;
  _cur := COALESCE(_cur, 0); _lng := COALESCE(_lng, 0);
  IF _last = _today THEN _new_cur := _cur;
  ELSIF _last = _yesterday THEN _new_cur := _cur + 1; _advanced := true;
  ELSE _new_cur := 1; _advanced := true; END IF;
  _new_lng := GREATEST(_new_cur, _lng);
  INSERT INTO public.streaks (user_id, current_streak, longest_streak, last_action_date, updated_at)
  VALUES (_uid, _new_cur, _new_lng, _today, now())
  ON CONFLICT (user_id) DO UPDATE SET current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak, last_action_date = EXCLUDED.last_action_date, updated_at = now();
  RETURN jsonb_build_object('updated', _updated > 0, 'current_streak', _new_cur, 'longest_streak', _new_lng, 'streak_advanced', _advanced);
END; $function$;

REVOKE ALL ON FUNCTION public.award_xp(text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_badge(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_mission(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_badge(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid, uuid) TO service_role;

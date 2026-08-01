DROP POLICY IF EXISTS "own sub insert" ON public.subscriptions;
DROP POLICY IF EXISTS "own sub update" ON public.subscriptions;

CREATE OR REPLACE FUNCTION public.subscriptions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'subscriptions can only be modified by the server';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS subscriptions_guard_ins ON public.subscriptions;
DROP TRIGGER IF EXISTS subscriptions_guard_upd ON public.subscriptions;
DROP TRIGGER IF EXISTS subscriptions_guard_del ON public.subscriptions;
CREATE TRIGGER subscriptions_guard_ins BEFORE INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard();
CREATE TRIGGER subscriptions_guard_upd BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard();
CREATE TRIGGER subscriptions_guard_del BEFORE DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard();
REVOKE EXECUTE ON FUNCTION public.subscriptions_guard() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "own xp" ON public.user_xp;
CREATE POLICY "own xp read" ON public.user_xp FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own xp events" ON public.xp_events;
CREATE POLICY "own xp events read" ON public.xp_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own badges" ON public.badges;
CREATE POLICY "own badges read" ON public.badges FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own streak" ON public.streaks;
CREATE POLICY "own streak read" ON public.streaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own usage" ON public.usage_daily;
CREATE POLICY "own usage read" ON public.usage_daily FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "own missions" ON public.missions;
CREATE POLICY "own missions read" ON public.missions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own missions delete" ON public.missions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.award_xp(_event_type text, _meta jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid(); _delta int; _current int; _new_total int;
  _level int := 1; _cumulative int := 0; _needed int; _into int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  _delta := CASE _event_type
    WHEN 'mission_completed' THEN 50 WHEN 'streak_day' THEN 10 WHEN 'chat_message' THEN 2
    WHEN 'roast_completed' THEN 15 WHEN 'roleplay_session' THEN 20
    WHEN 'memory_created' THEN 5 WHEN 'onboarding_complete' THEN 100 ELSE NULL END;
  IF _delta IS NULL THEN RAISE EXCEPTION 'invalid event_type' USING ERRCODE = '22023'; END IF;
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
END; $$;

CREATE OR REPLACE FUNCTION public.award_badge(_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.badges;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _key NOT IN ('first_mission','streak_3','streak_7','streak_30','level_5','level_10','first_roast','memory_master') THEN
    RAISE EXCEPTION 'invalid badge key' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.badges (user_id, badge_key) VALUES (_uid, _key)
  ON CONFLICT DO NOTHING RETURNING * INTO _row;
  IF _row.id IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_mission(_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
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
  ON CONFLICT (user_id) DO UPDATE SET current_streak = EXCLUDED.current_streak,
    longest_streak = EXCLUDED.longest_streak, last_action_date = EXCLUDED.last_action_date, updated_at = now();
  RETURN jsonb_build_object('updated', _updated > 0, 'current_streak', _new_cur, 'longest_streak', _new_lng, 'streak_advanced', _advanced);
END; $$;

-- handle_new_user REVOKE moved to later migration to ensure function exists first
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_xp(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.award_badge(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.paddle_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.paddle_webhook_events TO service_role;
ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_paddle_sub_uniq
  ON public.subscriptions(paddle_subscription_id)
  WHERE paddle_subscription_id IS NOT NULL;

DROP POLICY IF EXISTS "own uploads read" ON storage.objects;
DROP POLICY IF EXISTS "own uploads insert" ON storage.objects;
DROP POLICY IF EXISTS "own uploads update" ON storage.objects;
DROP POLICY IF EXISTS "own uploads delete" ON storage.objects;
CREATE POLICY "own uploads read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own uploads insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own uploads update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own uploads delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

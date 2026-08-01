CREATE TYPE public.memory_category AS ENUM (
  'goals','strengths','weaknesses','preferences','achievements',
  'missions','conversation_style','relationships','coaching_notes','general'
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, display_name TEXT, age_range TEXT, dating_experience TEXT,
  confidence_level INT, social_challenges TEXT[] DEFAULT '{}',
  interests TEXT[] DEFAULT '{}', coaching_style TEXT,
  goals TEXT, strengths TEXT, weaknesses TEXT,
  memory_enabled BOOLEAN NOT NULL DEFAULT true,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile delete" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro','elite')),
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sub read" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX subscriptions_paddle_sub_uniq ON public.subscriptions(paddle_subscription_id) WHERE paddle_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.subscriptions_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND session_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'subscriptions can only be modified by the server';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER subscriptions_guard_ins BEFORE INSERT ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard();
CREATE TRIGGER subscriptions_guard_upd BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard();
CREATE TRIGGER subscriptions_guard_del BEFORE DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan) VALUES (NEW.id, 'free') ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'chat',
  title TEXT, scenario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chats_user_updated ON public.chats(user_id, updated_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own chats" ON public.chats FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER chats_updated BEFORE UPDATE ON public.chats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT, image_urls JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_chat_created ON public.messages(chat_id, created_at);
CREATE INDEX messages_user ON public.messages(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX missions_user_date ON public.missions(user_id, assigned_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own missions read" ON public.missions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own missions delete" ON public.missions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_action_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.streaks TO authenticated;
GRANT ALL ON public.streaks TO service_role;
ALTER TABLE public.streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own streak read" ON public.streaks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER streaks_updated BEFORE UPDATE ON public.streaks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.usage_daily (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_daily TO authenticated;
GRANT ALL ON public.usage_daily TO service_role;
ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage read" ON public.usage_daily FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, content TEXT NOT NULL,
  category public.memory_category NOT NULL DEFAULT 'general',
  importance INT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  pinned BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'manual',
  coach_id TEXT, last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memories_user ON public.memories(user_id, archived, pinned DESC, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memories TO authenticated;
GRANT ALL ON public.memories TO service_role;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memories" ON public.memories FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER memories_updated BEFORE UPDATE ON public.memories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.user_xp (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xp INT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  xp_into_level INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_xp TO authenticated;
GRANT ALL ON public.user_xp TO service_role;
ALTER TABLE public.user_xp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own xp read" ON public.user_xp FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.xp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  xp_delta INT NOT NULL DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX xp_events_user_created ON public.xp_events(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.xp_events TO authenticated;
GRANT ALL ON public.xp_events TO service_role;
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own xp events read" ON public.xp_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_key)
);
CREATE INDEX badges_user ON public.badges(user_id, earned_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badges TO authenticated;
GRANT ALL ON public.badges TO service_role;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own badges read" ON public.badges FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.paddle_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.paddle_webhook_events TO service_role;
ALTER TABLE public.paddle_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own uploads read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own uploads insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own uploads update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own uploads delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE OR REPLACE FUNCTION public.award_xp(_event_type text, _meta jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _delta int; _current int; _new_total int;
  _level int := 1; _cumulative int := 0; _needed int; _into int;
  _today date := (now() AT TIME ZONE 'utc')::date;
  _mission_id uuid;
  _is_service boolean := (current_setting('role', true) = 'service_role');
BEGIN
  IF _uid IS NULL AND NOT _is_service THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  _delta := CASE _event_type
    WHEN 'mission_completed' THEN 50 WHEN 'streak_day' THEN 10 WHEN 'chat_message' THEN 2
    WHEN 'roast_completed' THEN 15 WHEN 'roleplay_session' THEN 20
    WHEN 'memory_created' THEN 5 WHEN 'onboarding_complete' THEN 100 ELSE NULL END;
  IF _delta IS NULL THEN RAISE EXCEPTION 'invalid event_type' USING ERRCODE = '22023'; END IF;
  IF NOT _is_service THEN
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
END; $$;

CREATE OR REPLACE FUNCTION public.award_badge(_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.badges; _ok boolean := false;
  _is_service boolean := (current_setting('role', true) = 'service_role');
BEGIN
  IF _uid IS NULL AND NOT _is_service THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _key NOT IN ('first_mission','streak_3','streak_7','streak_30','level_5','level_10','first_roast','memory_master') THEN
    RAISE EXCEPTION 'invalid badge key' USING ERRCODE = '22023';
  END IF;
  IF _is_service THEN _ok := true;
  ELSE
    IF _key = 'first_mission' THEN SELECT EXISTS (SELECT 1 FROM public.missions WHERE user_id = _uid AND completed = true) INTO _ok;
    ELSIF _key = 'streak_3' THEN SELECT COALESCE(longest_streak, 0) >= 3 FROM public.streaks WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'streak_7' THEN SELECT COALESCE(longest_streak, 0) >= 7 FROM public.streaks WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'streak_30' THEN SELECT COALESCE(longest_streak, 0) >= 30 FROM public.streaks WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'level_5' THEN SELECT COALESCE(level, 1) >= 5 FROM public.user_xp WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'level_10' THEN SELECT COALESCE(level, 1) >= 10 FROM public.user_xp WHERE user_id = _uid INTO _ok;
    ELSIF _key = 'memory_master' THEN SELECT (COUNT(*) >= 10) FROM public.memories WHERE user_id = _uid AND pinned = true INTO _ok;
    ELSIF _key = 'first_roast' THEN SELECT EXISTS (SELECT 1 FROM public.chats c WHERE c.user_id = _uid AND c.mode = 'roast' AND EXISTS (SELECT 1 FROM public.messages m WHERE m.chat_id = c.id AND m.role = 'user')) INTO _ok;
    END IF;
  END IF;
  IF NOT COALESCE(_ok, false) THEN RETURN NULL; END IF;
  INSERT INTO public.badges (user_id, badge_key) VALUES (_uid, _key)
  ON CONFLICT DO NOTHING RETURNING * INTO _row;
  IF _row.id IS NULL THEN RETURN NULL; END IF;
  RETURN to_jsonb(_row);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_mission(_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
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
  ON CONFLICT (user_id) DO UPDATE SET current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak, last_action_date = EXCLUDED.last_action_date, updated_at = now();
  RETURN jsonb_build_object('updated', _updated > 0, 'current_streak', _new_cur, 'longest_streak', _new_lng, 'streak_advanced', _advanced);
END; $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscriptions_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_xp(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.award_badge(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_xp(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_badge(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.subscriptions_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

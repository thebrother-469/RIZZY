
-- Idempotency for streak_day XP under concurrent same-day completions.
-- Mirrors xp_events_mission_completed_unique / xp_events_onboarding_unique.
-- Uses ((created_at AT TIME ZONE 'utc')::date) to match award_xp's day boundary.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_streak_day_unique
  ON public.xp_events (user_id, (((created_at AT TIME ZONE 'utc'))::date))
  WHERE event_type = 'streak_day';

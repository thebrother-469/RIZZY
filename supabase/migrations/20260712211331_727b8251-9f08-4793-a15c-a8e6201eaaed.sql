-- Onboarding XP is a per-user singleton event.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_onboarding_unique
  ON public.xp_events (user_id)
  WHERE event_type = 'onboarding_complete';

-- Mission-completion XP is unique per (user, mission_id).
-- meta->>'mission_id' is always populated by award_xp for this event type.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_mission_completed_unique
  ON public.xp_events (user_id, ((meta->>'mission_id')))
  WHERE event_type = 'mission_completed';
-- The previous UPDATE policy referenced public.missions inside its WITH CHECK
-- subqueries, which made Postgres recurse into the same policy (42P17) for
-- every client update. Replace the self-reference with a trigger guard.

DROP POLICY IF EXISTS "Users can update own mission reflection and skip" ON public.missions;

CREATE POLICY "Users can update own mission reflection and skip"
ON public.missions
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.missions_completion_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only client roles are restricted. SECURITY DEFINER routines such as
  -- public.complete_mission run as the function owner and stay unaffected.
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.completed IS DISTINCT FROM OLD.completed THEN
      RAISE EXCEPTION 'completion state is managed by complete_mission()'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
      RAISE EXCEPTION 'completed_at is managed by complete_mission()'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'mission ownership cannot be reassigned'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS missions_completion_guard ON public.missions;
CREATE TRIGGER missions_completion_guard
BEFORE UPDATE ON public.missions
FOR EACH ROW EXECUTE FUNCTION public.missions_completion_guard();
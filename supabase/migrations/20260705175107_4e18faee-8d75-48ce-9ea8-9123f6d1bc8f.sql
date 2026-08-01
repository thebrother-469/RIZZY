-- Prevent users from escalating their own plan by updating profiles.plan directly.
-- Only service_role (Paddle webhook / admin) may change the plan column.
CREATE OR REPLACE FUNCTION public.profiles_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan IS DISTINCT FROM OLD.plan
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    NEW.plan := OLD.plan;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_plan_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_plan_guard_upd ON public.profiles;
CREATE TRIGGER profiles_plan_guard_upd
  BEFORE UPDATE OF plan ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_plan_guard();
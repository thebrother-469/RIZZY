CREATE OR REPLACE FUNCTION public.profiles_onboarding_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.onboarded_at IS DISTINCT FROM OLD.onboarded_at
     AND current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    -- Silently ignore client attempts to set/reset onboarded_at.
    NEW.onboarded_at := OLD.onboarded_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_onboarding_guard_trg ON public.profiles;
CREATE TRIGGER profiles_onboarding_guard_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_onboarding_guard();
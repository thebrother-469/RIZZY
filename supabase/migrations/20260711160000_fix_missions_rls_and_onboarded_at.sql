-- Fix: missions_rls_regress
-- Completion goes exclusively through complete_mission (SECURITY DEFINER RPC).
-- Remove client-side UPDATE/DELETE and restore INSERT non-completed check.
DROP POLICY IF EXISTS "own missions update" ON public.missions;
DROP POLICY IF EXISTS "own missions delete" ON public.missions;
DROP POLICY IF EXISTS "own missions insert" ON public.missions;

CREATE POLICY "own missions insert"
  ON public.missions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND completed = false
    AND completed_at IS NULL
  );

-- Fix: onboard_xp_bypass
-- Prevent client UPDATE from setting profiles.onboarded_at. Only the service
-- role (completeOnboardingFn via supabaseAdmin) may change it.
CREATE OR REPLACE FUNCTION public.profiles_guard_onboarded_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.onboarded_at := OLD.onboarded_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_onboarded_at ON public.profiles;
CREATE TRIGGER profiles_guard_onboarded_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_onboarded_at();

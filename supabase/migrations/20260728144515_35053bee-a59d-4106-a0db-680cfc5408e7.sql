CREATE OR REPLACE FUNCTION public.profiles_onboarding_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.onboarded_at IS DISTINCT FROM OLD.onboarded_at
     AND current_user IS DISTINCT FROM 'service_role' THEN
    -- Only the Data API service role may set/reset authoritative completion.
    NEW.onboarded_at := OLD.onboarded_at;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_memory_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan text;
  _cap int;
  _count int;
BEGIN
  SELECT plan INTO _plan FROM public.subscriptions WHERE user_id = NEW.user_id;
  _plan := COALESCE(_plan, 'free');

  IF _plan = 'free' THEN
    _cap := 50;
  ELSIF _plan = 'pro' THEN
    _cap := 1000;
  ELSE
    RETURN NEW; -- elite / unknown paid tier: unlimited
  END IF;

  SELECT count(*) INTO _count FROM public.memories WHERE user_id = NEW.user_id;
  IF _count >= _cap THEN
    RAISE EXCEPTION 'memory_cap_reached: plan % allows up to % memories', _plan, _cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_memory_cap_trg ON public.memories;
CREATE TRIGGER enforce_memory_cap_trg
  BEFORE INSERT ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_memory_cap();

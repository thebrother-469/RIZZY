
CREATE TABLE public.profile_gen_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

GRANT SELECT ON public.profile_gen_usage TO authenticated;
GRANT ALL ON public.profile_gen_usage TO service_role;

ALTER TABLE public.profile_gen_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile gen usage read"
  ON public.profile_gen_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "block client insert profile gen usage"
  ON public.profile_gen_usage
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "block client update profile gen usage"
  ON public.profile_gen_usage
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "block client delete profile gen usage"
  ON public.profile_gen_usage
  FOR DELETE TO authenticated USING (false);

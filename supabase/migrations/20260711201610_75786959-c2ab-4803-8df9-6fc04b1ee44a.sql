
DROP POLICY IF EXISTS "Users can update their own missions" ON public.missions;
DROP POLICY IF EXISTS "Users can delete their own missions" ON public.missions;
DROP POLICY IF EXISTS "Users can create their own missions" ON public.missions;

CREATE POLICY "Users can create their own missions"
  ON public.missions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND completed = false
    AND completed_at IS NULL
  );

REVOKE UPDATE, DELETE ON public.missions FROM authenticated;

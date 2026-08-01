CREATE POLICY "Users can update their own missions"
  ON public.missions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own missions"
  ON public.missions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
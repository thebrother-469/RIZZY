CREATE POLICY "Users can update own mission reflection and skip"
ON public.missions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND completed = (SELECT m.completed FROM public.missions m WHERE m.id = missions.id)
  AND completed_at IS NOT DISTINCT FROM (SELECT m.completed_at FROM public.missions m WHERE m.id = missions.id)
);
CREATE POLICY "own missions insert" ON public.missions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own missions update" ON public.missions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own missions delete" ON public.missions FOR DELETE TO authenticated USING (auth.uid() = user_id);
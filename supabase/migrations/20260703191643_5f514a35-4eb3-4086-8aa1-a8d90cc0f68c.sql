REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- handle_new_user REVOKE moved to later migration to ensure function exists first

-- Storage policies: users can only touch files in their own folder (uploads/<user_id>/...)
CREATE POLICY IF NOT EXISTS "own uploads read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY IF NOT EXISTS "own uploads insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY IF NOT EXISTS "own uploads update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY IF NOT EXISTS "own uploads delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

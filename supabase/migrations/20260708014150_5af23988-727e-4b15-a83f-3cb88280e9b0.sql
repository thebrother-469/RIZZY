DROP POLICY IF EXISTS "own uploads read" ON storage.objects;
CREATE POLICY "own uploads read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "own uploads insert" ON storage.objects;
CREATE POLICY "own uploads insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "own uploads update" ON storage.objects;
CREATE POLICY "own uploads update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "own uploads delete" ON storage.objects;
CREATE POLICY "own uploads delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
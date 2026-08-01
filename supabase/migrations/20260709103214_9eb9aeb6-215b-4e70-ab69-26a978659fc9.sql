
DROP POLICY IF EXISTS "users read own uploads" ON storage.objects;
DROP POLICY IF EXISTS "users update own uploads" ON storage.objects;
DROP POLICY IF EXISTS "users delete own uploads" ON storage.objects;
DROP POLICY IF EXISTS "users upload own" ON storage.objects;

CREATE POLICY "users read own uploads"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'uploads'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "users update own uploads"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'uploads'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'uploads'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "users delete own uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'uploads'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "users upload own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

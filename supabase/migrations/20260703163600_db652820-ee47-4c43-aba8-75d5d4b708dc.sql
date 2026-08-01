-- 1. Remove broad anon SELECT on uploads bucket (allows listing + directory scanning).
-- Public URLs continue to work because the bucket is public and Supabase serves
-- /storage/v1/object/public/uploads/* independently of storage.objects RLS.
DROP POLICY IF EXISTS "uploads public read" ON storage.objects;

-- 2. Add explicit owner-scoped UPDATE policy so metadata/overwrites are controlled.
DROP POLICY IF EXISTS "users update own uploads" ON storage.objects;
CREATE POLICY "users update own uploads"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Lock down SECURITY DEFINER functions. handle_new_user runs from an auth.users
-- trigger. rls_auto_enable was removed (function does not exist).
-- handle_new_user REVOKE moved to later migration to ensure function exists first
-- rls_auto_enable does not exist and has been removed from codebase

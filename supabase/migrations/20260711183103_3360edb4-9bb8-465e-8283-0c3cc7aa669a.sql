DROP POLICY IF EXISTS "own missions update" ON public.missions;
DROP POLICY IF EXISTS "own missions delete" ON public.missions;
DROP POLICY IF EXISTS "Users can update own missions" ON public.missions;
DROP POLICY IF EXISTS "Users can delete own missions" ON public.missions;
REVOKE UPDATE, DELETE ON public.missions FROM authenticated;
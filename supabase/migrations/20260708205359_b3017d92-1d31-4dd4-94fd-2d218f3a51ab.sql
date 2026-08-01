-- The app uses Supabase REST/Data API, not pg_graphql. Remove GraphQL schema
-- and function privileges from PUBLIC as well as anon/authenticated so inherited
-- EXECUTE/USAGE grants cannot keep /graphql/v1 introspection available.
REVOKE USAGE ON SCHEMA graphql FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM PUBLIC, anon, authenticated;

REVOKE USAGE ON SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql_public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM PUBLIC, anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA graphql
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql_public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Defense in depth for pg_graphql table discovery if the extension is re-enabled
-- or privileges are restored later. Preserve existing REST grants/RLS policies.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I', n.nspname, c.relname) AS ident
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format($f$COMMENT ON TABLE %s IS E'@graphql({"skip_table": true})'$f$, r.ident);
  END LOOP;
END $$;
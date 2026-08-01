-- The application uses only PostgREST (supabase-js .from()); nothing calls GraphQL.
-- Removing graphql access for anon/authenticated hides every object from the
-- GraphQL schema without touching REST grants or RLS policies.
REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA graphql FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA graphql REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA graphql REVOKE ALL ON SEQUENCES FROM anon, authenticated;

REVOKE USAGE ON SCHEMA graphql_public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA graphql_public FROM anon, authenticated;

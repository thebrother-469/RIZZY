DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS ident
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','f','p')
  LOOP
    EXECUTE format($f$COMMENT ON TABLE %s IS E'@graphql({"skip_table": true})'$f$, r.ident);
  END LOOP;
END $$;
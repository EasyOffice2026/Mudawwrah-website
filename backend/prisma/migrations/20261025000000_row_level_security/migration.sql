-- Row-level security on every table, with no policies: Supabase's public Data API (the "anon" and
-- "authenticated" roles) can then read and write nothing, even if a grant is ever added by mistake.
-- The server is unaffected: it connects as the tables' owner, which bypasses row-level security.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

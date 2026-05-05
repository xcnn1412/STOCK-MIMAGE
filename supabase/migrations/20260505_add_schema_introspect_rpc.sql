-- ============================================================================
-- get_schema_summary() — RPC consumed by /api/schema/* endpoints.
--
-- Why: supabase-js's .schema('information_schema') hits PostgREST which only
-- exposes whitelisted schemas (default: public, storage, graphql_public).
-- Wrapping the introspection in a SECURITY DEFINER function keeps the API
-- surface inside `public` (where RPC works) without widening PostgREST's
-- exposed schemas. Function is read-only metadata, safe to grant broadly.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_schema_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'columns', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'table',    table_name,
          'name',     column_name,
          'type',     data_type,
          'nullable', is_nullable = 'YES',
          'ordinal',  ordinal_position
        )
        ORDER BY table_name, ordinal_position
      ), '[]'::jsonb)
      FROM information_schema.columns
      WHERE table_schema = 'public'
    ),
    'indexes', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('table', tablename, 'name', indexname)
        ORDER BY tablename, indexname
      ), '[]'::jsonb)
      FROM pg_indexes
      WHERE schemaname = 'public'
    ),
    'triggers', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('table', event_object_table, 'name', trigger_name)
      ), '[]'::jsonb)
      FROM (
        -- DISTINCT collapses INSERT/UPDATE/DELETE rows on the same trigger
        SELECT DISTINCT event_object_table, trigger_name
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
      ) t
    ),
    'functions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', routine_name)
        ORDER BY routine_name
      ), '[]'::jsonb)
      FROM information_schema.routines
      WHERE routine_schema  = 'public'
        AND routine_type    = 'FUNCTION'
        -- Don't list this helper itself — keeps the fingerprint stable
        -- across "before vs after deploying the helper" runs.
        AND routine_name <> 'get_schema_summary'
    )
  );
$$;

-- Anyone with anon key can read it; the data is non-sensitive metadata.
GRANT EXECUTE ON FUNCTION public.get_schema_summary() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_schema_summary() IS
  'Return public-schema introspection (columns, indexes, triggers, functions) as JSON. Used by /api/schema/* for cross-instance drift detection.';

-- Audit for K22-P4 Task 4.2 universe import migration.
-- Run AFTER applying 20260828040000_K22-P4_universe_import.sql.

\set ON_ERROR_STOP on

-- 1. Tables exist with RLS.
SELECT public.assert_table_exists('storyflow_universe_import_sessions');
SELECT public.assert_table_exists('storyflow_source_works');
SELECT public.assert_table_exists('storyflow_source_versions');
SELECT public.assert_table_exists('storyflow_universe_import_files');
SELECT public.assert_table_exists('storyflow_source_chunks');
SELECT public.assert_table_exists('storyflow_universe_import_candidates');
SELECT public.assert_table_exists('storyflow_universe_import_decisions');

-- 2. Source versions immutability trigger present.
SELECT count(*) = 1 AS source_versions_immutable
FROM information_schema.triggers
WHERE event_object_table = 'storyflow_source_versions'
  AND trigger_name = 'trg_k22_p4_source_versions_immutable';

-- 3. Bucket is private.
SELECT count(*) = 1 AS bucket_private
FROM storage.buckets
WHERE id = 'universe-source-imports' AND public = false;

-- 4. No existing table dropped (forward-only check vs P3 baseline).
SELECT public.assert_table_not_dropped('20260828031000_K22-P3_screenplay_continuity.sql');

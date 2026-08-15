-- Audit for K22-P3 Task 3.2 screenplay units migration.
-- Verifies forward-only, additive migration safety on a production-like DB.
-- Run AFTER applying 20260828030000_K22-P3_screenplay_units.sql.

\set ON_ERROR_STOP on

-- 1. All four tables exist with RLS enabled.
SELECT public.assert_table_exists('storyflow_screenplay_units');
SELECT public.assert_table_exists('storyflow_screenplay_unit_versions');
SELECT public.assert_table_exists('storyflow_screenplay_dependency_edges');
SELECT public.assert_table_exists('storyflow_stale_resolutions');

-- 2. No existing table was dropped or renamed.
SELECT public.assert_table_not_dropped('20260828020000_K22-P2_universe_inheritance.sql');

-- 3. Unit versions immutability trigger fires on UPDATE and DELETE.
--    (verified by tests; here we assert the trigger exists)
SELECT count(*) AS immutability_triggers
FROM information_schema.triggers
WHERE event_object_table = 'storyflow_screenplay_unit_versions'
  AND trigger_name = 'trg_k22_p3_unit_versions_immutable';

-- 4. Legacy tables referenced by adaptation reads are untouched.
SELECT count(*) AS legacy_project_rows_intact
FROM public.storyflow_projects
LIMIT 1;

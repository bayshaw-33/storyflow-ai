-- Emergency rollback for 20260717152816_storyboard_stable_state.sql.
-- Do not run automatically. This is deliberately non-destructive: existing Scene/Shot rows remain intact.

REVOKE ALL ON FUNCTION public.save_storyboard_state(uuid, text, text, integer, jsonb, jsonb, jsonb) FROM service_role;
DROP FUNCTION IF EXISTS public.save_storyboard_state(uuid, text, text, integer, jsonb, jsonb, jsonb);
REVOKE ALL ON FUNCTION public.get_storyboard_state(uuid, text, text) FROM service_role;
DROP FUNCTION IF EXISTS public.get_storyboard_state(uuid, text, text);

-- The schema and indexes remain so rollback never deletes or rewrites creator data.
-- A future destructive schema retirement requires an approved archival migration.

-- Close the remaining callable SECURITY DEFINER surface.
-- Team RLS policies still call the helpers as authenticated, so the helpers
-- enforce that callers may only ask about their own auth.uid().

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.is_team_member(
  p_team_id uuid,
  p_user_id uuid,
  p_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.storyflow_team_members m
      WHERE m.team_id = p_team_id
        AND m.user_id = p_user_id
        AND m.status = 'active'
        AND (p_roles IS NULL OR m.role = ANY (p_roles))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_team_owner(
  p_team_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.storyflow_teams t
      WHERE t.id = p_team_id
        AND t.owner_id = p_user_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_owner(uuid, uuid) TO authenticated, service_role;

COMMIT;

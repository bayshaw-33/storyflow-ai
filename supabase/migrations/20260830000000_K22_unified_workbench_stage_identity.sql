-- K22 unified production workbench stage identity.
-- Additive only: existing legacy Works stay valid and no uniqueness index is
-- introduced across historical rows.

CREATE OR REPLACE FUNCTION public.ensure_project_stage_work(
  p_owner_id uuid,
  p_project_id text,
  p_work_type text,
  p_title text,
  p_idempotency_key text
) RETURNS TABLE(work_id uuid, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_work_id uuid;
  new_work_id uuid;
BEGIN
  IF p_work_type NOT IN ('script','art','storyboard','video') THEN
    RAISE EXCEPTION 'INVALID_PRODUCTION_STAGE' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.storyflow_projects p
    WHERE p.id = p_project_id
      AND COALESCE(p.owner_id, p.user_id) = p_owner_id
  ) THEN
    RAISE EXCEPTION 'PROJECT_NOT_OWNED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_project_id || ':' || p_work_type, 0));

  SELECT w.id INTO existing_work_id
  FROM public.storyflow_works w
  WHERE w.project_id = p_project_id
    AND w.owner_id = p_owner_id
    AND w.work_type = p_work_type
    AND w.status <> 'archived'
  ORDER BY w.is_primary DESC, w.updated_at DESC, w.created_at DESC
  LIMIT 1;

  IF existing_work_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_work_id, false;
    RETURN;
  END IF;

  new_work_id := gen_random_uuid();
  INSERT INTO public.storyflow_works(
    id, owner_id, project_id, work_type, title, status,
    is_primary, universe_id, idempotency_key
  )
  SELECT
    new_work_id, p_owner_id, p_project_id, p_work_type, p_title, 'editing_draft',
    false, p.universe_id, p_idempotency_key
  FROM public.storyflow_projects p
  WHERE p.id = p_project_id;

  RETURN QUERY SELECT new_work_id, true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_project_stage_work(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;

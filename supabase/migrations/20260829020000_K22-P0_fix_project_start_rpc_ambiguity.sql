-- K22-P0 hotfix: output-column names in RETURNS TABLE shadowed the project-start
-- ledger columns. Qualify every ledger field in the idempotency lookup.

CREATE OR REPLACE FUNCTION public.create_project_with_primary_work(
  owner_id uuid,
  work_type text,
  title text,
  universe_id uuid DEFAULT NULL,
  idempotency_key text DEFAULT NULL
) RETURNS TABLE(project_id text, work_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_project_id text;
  existing_work_id uuid;
  new_project_id text;
  new_work_id uuid;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'MISSING_OWNER_ID' USING ERRCODE = 'not_null_violation';
  END IF;
  IF idempotency_key IS NULL OR idempotency_key = '' THEN
    RAISE EXCEPTION 'MISSING_IDEMPOTENCY_KEY' USING ERRCODE = 'not_null_violation';
  END IF;
  IF work_type NOT IN ('script','song','art','storyboard','video','voice','editing') THEN
    RAISE EXCEPTION 'INVALID_WORK_TYPE: %', work_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT starts.project_id, starts.work_id INTO existing_project_id, existing_work_id
  FROM public.storyflow_project_starts AS starts
  WHERE starts.owner_id = create_project_with_primary_work.owner_id
    AND starts.idempotency_key = create_project_with_primary_work.idempotency_key
  LIMIT 1;

  IF existing_project_id IS NOT NULL THEN
    RETURN QUERY SELECT existing_project_id, existing_work_id;
    RETURN;
  END IF;

  new_project_id := 'proj_' || replace(gen_random_uuid()::text, '-', '');
  new_work_id := gen_random_uuid();

  INSERT INTO public.storyflow_projects(
    id, title, workflow_type, project_group, status,
    user_id, owner_id, current_phase, created_at, updated_at, data
  ) VALUES (
    new_project_id, title, work_type, '默认分组', 'draft',
    owner_id, owner_id, 'project_setup', now(), now(),
    jsonb_build_object(
      'workType', work_type,
      'primaryWorkId', new_work_id,
      'source', 'k22_p0_project_start',
      'contractVersion', '2.2.0-alpha.1'
    )
  );

  INSERT INTO public.storyflow_works(
    id, owner_id, project_id, work_type, title, status, is_primary, universe_id, idempotency_key
  ) VALUES (
    new_work_id, owner_id, new_project_id, work_type, title, 'editing_draft', true, universe_id, idempotency_key
  );

  INSERT INTO public.storyflow_project_starts(
    owner_id, idempotency_key, project_id, work_id, work_type
  ) VALUES (
    owner_id, idempotency_key, new_project_id, new_work_id, work_type
  );

  RETURN QUERY SELECT new_project_id, new_work_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_project_with_primary_work(uuid, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_project_with_primary_work(uuid, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_project_with_primary_work(uuid, text, text, uuid, text) FROM authenticated;

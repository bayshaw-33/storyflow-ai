-- K22-P0: Minimal Work identity + atomic Project/primary Work creation.
-- Forward-only, additive. Does not modify existing migrations or tables
-- except referencing public.storyflow_projects(id) which already exists.
--
-- Phase 1 will extend storyflow_works with version/conversation ledgers
-- without rebuilding this identity surface.

-- ============================================================
-- storyflow_works: minimal Work identity (Phase 0)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'editing_draft',
  is_primary boolean NOT NULL DEFAULT false,
  universe_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (work_type IN ('script','song','art','storyboard','video','voice','editing')),
  CHECK (status IN ('editing_draft','checkpoint','finalized','archived'))
);

-- One primary Work per Project.
CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p0_primary_work_per_project
  ON public.storyflow_works(project_id) WHERE is_primary;

-- Idempotency: one project-start per (owner, key).
CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p0_works_idempotency
  ON public.storyflow_works(owner_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_k22_p0_works_owner
  ON public.storyflow_works(owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_k22_p0_works_project
  ON public.storyflow_works(project_id, created_at DESC);

ALTER TABLE public.storyflow_works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p0_works_owner_select ON public.storyflow_works;
CREATE POLICY k22_p0_works_owner_select
  ON public.storyflow_works FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS k22_p0_works_owner_insert ON public.storyflow_works;
CREATE POLICY k22_p0_works_owner_insert
  ON public.storyflow_works FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS k22_p0_works_owner_update ON public.storyflow_works;
CREATE POLICY k22_p0_works_owner_update
  ON public.storyflow_works FOR UPDATE
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS k22_p0_works_owner_delete ON public.storyflow_works;
CREATE POLICY k22_p0_works_owner_delete
  ON public.storyflow_works FOR DELETE
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- storyflow_project_starts: idempotency ledger for atomic creation.
-- Stores the (owner, key) → (project, work) mapping so replaying the same
-- idempotency key returns the same project/work pair without re-inserting.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_project_starts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  project_id text NOT NULL REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  work_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, idempotency_key)
);

ALTER TABLE public.storyflow_project_starts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p0_starts_owner_select ON public.storyflow_project_starts;
CREATE POLICY k22_p0_starts_owner_select
  ON public.storyflow_project_starts FOR SELECT
  USING (owner_id = (select auth.uid()));

-- ============================================================
-- create_project_with_primary_work RPC
-- Atomic, idempotent, SECURITY DEFINER. Only the service role may call it
-- (REVOKE from PUBLIC/anon/authenticated). RLS still gates direct table access.
-- ============================================================

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

  -- Idempotency: return the previously-created pair if the key was used.
  SELECT project_id, work_id INTO existing_project_id, existing_work_id
  FROM public.storyflow_project_starts
  WHERE owner_id = create_project_with_primary_work.owner_id
    AND idempotency_key = create_project_with_primary_work.idempotency_key
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

-- Only the service role (which bypasses RLS and has EXECUTE by default as a
-- superuser-equivalent) may call this RPC. anon/authenticated cannot.
REVOKE EXECUTE ON FUNCTION public.create_project_with_primary_work(uuid, text, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_project_with_primary_work(uuid, text, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_project_with_primary_work(uuid, text, text, uuid, text) FROM authenticated;

COMMENT ON TABLE public.storyflow_works IS 'K22-P0 minimal Work identity. Phase 1 adds version/conversation ledgers.';
COMMENT ON TABLE public.storyflow_project_starts IS 'K22-P0 idempotency ledger for atomic project + primary work creation.';
COMMENT ON FUNCTION public.create_project_with_primary_work IS 'K22-P0 atomic Project + primary Work creator. SECURITY DEFINER; only service role may call.';

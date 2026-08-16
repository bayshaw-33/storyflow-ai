-- K22 production hotfix (2026-08-16): candidate controlled transitions +
-- screenplay unit version idempotency + service-call-safe RPCs.
-- Forward-only; does not modify any earlier migration file.
--
-- Fixes (found during production recovery):
--   1. P6's block_append_only_mutation trigger on storyflow_generation_candidates
--      rejects EVERY update — including the apply RPC's internal status
--      transition. Replace with a transition guard that only allows
--      ready/pending_review -> applied/rejected/superseded with immutable
--      payload columns; DELETE stays blocked.
--   2. Server inserts candidates with status 'pending_review' while P1's CHECK
--      only allows 'ready'. Widen the CHECK to accept both.
--   3. storyflow_screenplay_unit_versions lacked the idempotency_key column
--      the units service queries/inserts.
--   4. P1's append_work_version / apply_generation_candidate derive created_by
--      and owner checks from auth.uid(), which is NULL on the service-role
--      call path — created_by NOT NULL then fails. Replace them with
--      actor-explicit variants (the route layer already verifies the Bearer
--      viewer; p_actor is that verified id).

-- ============================================================
-- 1. unit_versions idempotency
-- ============================================================

ALTER TABLE public.storyflow_screenplay_unit_versions
  ADD COLUMN IF NOT EXISTS idempotency_key text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p3_unit_versions_idempotency
  ON public.storyflow_screenplay_unit_versions(unit_id, idempotency_key)
  WHERE idempotency_key <> '';

-- generation_request_snapshots: the service persists scope_json/request_json
-- which P1 never created.
ALTER TABLE public.storyflow_generation_request_snapshots
  ADD COLUMN IF NOT EXISTS scope_json jsonb,
  ADD COLUMN IF NOT EXISTS request_json jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- 2. candidates status CHECK accepts pending_review
-- ============================================================

ALTER TABLE public.storyflow_generation_candidates
  DROP CONSTRAINT IF EXISTS storyflow_generation_candidates_status_check;

ALTER TABLE public.storyflow_generation_candidates
  ADD CONSTRAINT storyflow_generation_candidates_status_check
  CHECK (status IN ('ready','pending_review','applied','rejected','superseded'));

-- ============================================================
-- 3. transition guard replaces the blanket append-only block
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_candidate_transitions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'generation_candidates cannot be deleted (append-only ledger)'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.content_json IS DISTINCT FROM OLD.content_json
     OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'generation_candidates payload columns are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status IN ('ready','pending_review') AND NEW.status = 'applied' THEN
    IF NEW.applied_version_id IS NULL THEN
      RAISE EXCEPTION 'applied candidate requires applied_version_id'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IN ('ready','pending_review') AND NEW.status = 'rejected' THEN
    IF NEW.applied_version_id IS NOT NULL THEN
      RAISE EXCEPTION 'rejected candidate cannot reference an applied version'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'superseded' AND NEW.status = 'superseded' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'illegal candidate status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_k22_p6_candidates_immutable ON public.storyflow_generation_candidates;
DROP TRIGGER IF EXISTS trg_k22_candidates_transitions ON public.storyflow_generation_candidates;
CREATE TRIGGER trg_k22_candidates_transitions
  BEFORE UPDATE OR DELETE ON public.storyflow_generation_candidates
  FOR EACH ROW EXECUTE FUNCTION public.guard_candidate_transitions();

-- ============================================================
-- 4. actor-explicit RPCs (service-role path passes the verified
--    viewer id as p_actor; owner check compares against the row)
-- ============================================================

-- 4a. append_work_version(p_actor, ...) replaces the auth.uid()-based P1 RPC.
DROP FUNCTION IF EXISTS public.append_work_version(uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid);
DROP FUNCTION IF EXISTS public.append_work_version(uuid, uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid);

CREATE FUNCTION public.append_work_version(
  p_actor uuid,
  p_work_id uuid,
  p_parent_version_id uuid,
  p_kind text,
  p_content_schema text,
  p_content_json jsonb,
  p_content_hash text,
  p_source text,
  p_source_message_ids text[] DEFAULT '{}',
  p_source_job_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_expected_current_version_id uuid DEFAULT NULL
) RETURNS public.storyflow_work_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work public.storyflow_works%ROWTYPE;
  v_existing public.storyflow_work_versions;
  v_new public.storyflow_work_versions;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'MISSING_ACTOR' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT * INTO v_work FROM public.storyflow_works WHERE id = p_work_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORK_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_work.owner_id <> p_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing FROM public.storyflow_work_versions
      WHERE work_id = p_work_id AND idempotency_key = p_idempotency_key
      LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  IF p_expected_current_version_id IS NOT NULL THEN
    IF v_work.current_version_id IS DISTINCT FROM p_expected_current_version_id THEN
      RAISE EXCEPTION 'VERSION_CONFLICT: expected %, got %',
        p_expected_current_version_id, v_work.current_version_id
        USING ERRCODE = '40001';
    END IF;
  END IF;

  IF p_kind = 'finalized' THEN
    IF p_parent_version_id IS NULL THEN
      RAISE EXCEPTION 'FINALIZE_REQUIRES_PARENT' USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM public.storyflow_work_versions
      WHERE id = p_parent_version_id AND work_id = p_work_id
        AND kind IN ('checkpoint','editing_draft');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZE_PARENT_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  INSERT INTO public.storyflow_work_versions(
    work_id, parent_version_id, kind,
    content_schema, content_json, content_hash,
    source, source_message_ids, source_job_id,
    idempotency_key, created_by
  ) VALUES (
    p_work_id, p_parent_version_id, p_kind,
    p_content_schema, p_content_json, p_content_hash,
    p_source, p_source_message_ids, p_source_job_id,
    COALESCE(NULLIF(p_idempotency_key, ''), 'gen_' || gen_random_uuid()::text),
    p_actor
  ) RETURNING * INTO v_new;

  UPDATE public.storyflow_works SET
    current_version_id = v_new.id,
    latest_checkpoint_id = CASE WHEN p_kind = 'checkpoint' THEN v_new.id ELSE latest_checkpoint_id END,
    finalized_version_id = CASE WHEN p_kind = 'finalized' THEN v_new.id ELSE finalized_version_id END,
    status = CASE WHEN p_kind = 'finalized' THEN 'finalized' ELSE status END,
    updated_at = now()
  WHERE id = p_work_id;

  RETURN v_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_work_version(uuid, uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_work_version(uuid, uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_work_version(uuid, uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid) FROM authenticated;

-- 4b. reject_generation_candidate — atomic owner-checked rejection.
CREATE OR REPLACE FUNCTION public.reject_generation_candidate(
  p_actor uuid,
  p_candidate_id uuid
) RETURNS TABLE(candidate_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate public.storyflow_generation_candidates%ROWTYPE;
  v_work public.storyflow_works%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'MISSING_ACTOR' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT * INTO v_candidate FROM public.storyflow_generation_candidates
    WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT * INTO v_work FROM public.storyflow_works WHERE id = v_candidate.work_id;
  IF v_work.owner_id <> p_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_candidate.status = 'rejected' THEN
    RETURN QUERY SELECT v_candidate.id, v_candidate.status;
    RETURN;
  END IF;

  IF v_candidate.status NOT IN ('ready','pending_review') THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_REJECTABLE: status=%', v_candidate.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.storyflow_generation_candidates
    SET status = 'rejected'
    WHERE id = v_candidate.id;

  RETURN QUERY SELECT v_candidate.id, 'rejected'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_generation_candidate(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_generation_candidate(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_generation_candidate(uuid, uuid) FROM authenticated;

-- 4c. apply_screenplay_candidate — atomic filtered-patch apply: appends the
--     work version from the user-filtered patch set, transitions the
--     candidate, updates the work pointer. p_content_* carry the filtered
--     payload so per-hunk adoption stays possible.
CREATE OR REPLACE FUNCTION public.apply_screenplay_candidate(
  p_actor uuid,
  p_candidate_id uuid,
  p_content_schema text,
  p_content_json jsonb,
  p_content_hash text,
  p_idempotency_key text
) RETURNS TABLE(candidate_id uuid, new_version_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate public.storyflow_generation_candidates%ROWTYPE;
  v_work public.storyflow_works%ROWTYPE;
  v_existing public.storyflow_work_versions%ROWTYPE;
  v_new public.storyflow_work_versions%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'MISSING_ACTOR' USING ERRCODE = 'not_null_violation';
  END IF;
  SELECT * INTO v_candidate FROM public.storyflow_generation_candidates
    WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT * INTO v_work FROM public.storyflow_works WHERE id = v_candidate.work_id;
  IF v_work.owner_id <> p_actor THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing FROM public.storyflow_work_versions
      WHERE work_id = v_candidate.work_id AND idempotency_key = p_idempotency_key
      LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT v_candidate.id, v_existing.id;
      RETURN;
    END IF;
  END IF;

  IF v_candidate.status = 'applied' AND v_candidate.applied_version_id IS NOT NULL THEN
    RETURN QUERY SELECT v_candidate.id, v_candidate.applied_version_id;
    RETURN;
  END IF;

  IF v_candidate.status NOT IN ('ready','pending_review') THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_READY: status=%', v_candidate.status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.storyflow_work_versions(
    work_id, parent_version_id, kind,
    content_schema, content_json, content_hash,
    source, source_message_ids, source_job_id,
    idempotency_key, created_by
  ) VALUES (
    v_candidate.work_id, v_work.current_version_id, 'editing_draft',
    COALESCE(NULLIF(p_content_schema, ''), 'kiikis.screenplay-candidate/1'),
    p_content_json, COALESCE(NULLIF(p_content_hash, ''), encode(sha256(convert_to(COALESCE(p_content_json::text, '{}'), 'utf8')), 'hex')),
    'ai', '{}'::text[], NULL,
    COALESCE(NULLIF(p_idempotency_key, ''), 'apply_' || p_candidate_id::text || '_' || gen_random_uuid()::text),
    p_actor
  ) RETURNING * INTO v_new;

  UPDATE public.storyflow_generation_candidates
    SET status = 'applied',
        applied_version_id = v_new.id,
        applied_at = now()
    WHERE id = v_candidate.id;

  UPDATE public.storyflow_works
    SET current_version_id = v_new.id,
        updated_at = now()
    WHERE id = v_candidate.work_id;

  RETURN QUERY SELECT v_candidate.id, v_new.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_screenplay_candidate(uuid, uuid, text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_screenplay_candidate(uuid, uuid, text, jsonb, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_screenplay_candidate(uuid, uuid, text, jsonb, text, text) FROM authenticated;

-- 4d. apply_generation_candidate(p_actor, ...) replaces the auth.uid()-based
--     P1 RPC of the same purpose (full-content apply).
DROP FUNCTION IF EXISTS public.apply_generation_candidate(uuid, text, text);

CREATE FUNCTION public.apply_generation_candidate(
  p_actor uuid,
  p_candidate_id uuid,
  p_content_schema text,
  p_idempotency_key text
) RETURNS TABLE(candidate_id uuid, new_version_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate public.storyflow_generation_candidates%ROWTYPE;
  v_work public.storyflow_works%ROWTYPE;
  v_new public.storyflow_work_versions%ROWTYPE;
  v_content jsonb;
BEGIN
  SELECT content_json INTO v_content FROM public.storyflow_generation_candidates
    WHERE id = p_candidate_id;
  RETURN QUERY SELECT * FROM public.apply_screenplay_candidate(
    p_actor,
    p_candidate_id,
    p_content_schema,
    v_content,
    '',
    p_idempotency_key
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_generation_candidate(uuid, uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_generation_candidate(uuid, uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_generation_candidate(uuid, uuid, text, text) FROM authenticated;

COMMENT ON FUNCTION public.guard_candidate_transitions IS
  'K22 hotfix: candidates allow only ready/pending_review -> applied/rejected/superseded with immutable payload; DELETE always blocked.';
COMMENT ON FUNCTION public.reject_generation_candidate IS
  'K22 hotfix: atomic owner-checked candidate rejection. SECURITY DEFINER; service role only.';
COMMENT ON FUNCTION public.apply_screenplay_candidate IS
  'K22 hotfix: atomic filtered-patch candidate apply (version append + transition + pointer). SECURITY DEFINER; service role only.';

-- ============================================================
-- 5. evidence_events coexistence (July chained ledger + K22 work-scoped rows)
--
--    P3-continuity assumed K2-C-09 had created a same-named table with the
--    K22 shape; it actually created storyflow_v2_evidence_events. On
--    databases where the July chained ledger owns this table, K22-style
--    inserts ({work_id, kind, payload_json, created_by}) violate the July
--    NOT NULL/CHECK constraints. Relax exactly those columns so both row
--    shapes coexist: July rows keep their chain (its RPC still enforces its
--    own values); K22 rows are work-scoped and skip the chain fields.
-- ============================================================

ALTER TABLE public.storyflow_evidence_events
  ALTER COLUMN case_id DROP NOT NULL,
  ALTER COLUMN owner_id DROP NOT NULL,
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN source_unit_id DROP NOT NULL,
  ALTER COLUMN sequence_number DROP NOT NULL,
  ALTER COLUMN subject_type DROP NOT NULL,
  ALTER COLUMN subject_id DROP NOT NULL,
  ALTER COLUMN event_hash DROP NOT NULL,
  ALTER COLUMN idempotency_key DROP NOT NULL,
  ALTER COLUMN occurred_at SET DEFAULT now();

ALTER TABLE public.storyflow_evidence_events
  DROP CONSTRAINT IF EXISTS storyflow_evidence_events_event_type_check;

ALTER TABLE public.storyflow_evidence_events
  ALTER COLUMN event_type SET DEFAULT 'work_scoped';

ALTER TABLE public.storyflow_evidence_events
  ADD CONSTRAINT storyflow_evidence_events_event_type_check
  CHECK (event_type IN (
    'storyboard_snapshot_saved', 'generation_completed', 'reference_selected',
    'export_released', 'package_generated', 'work_scoped'
  ));

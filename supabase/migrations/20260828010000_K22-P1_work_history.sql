-- K22-P1: Work Version, Checkpoint, Finalized + Conversation Ledger +
-- Generation Snapshot + Candidate. Forward-only, additive.
--
-- Extends storyflow_works (Phase 0) with version pointers and adds:
--   storyflow_work_versions (immutable append-only)
--   storyflow_conversation_threads
--   storyflow_conversation_messages (append-only)
--   storyflow_generation_request_snapshots (append-only)
--   storyflow_generation_candidates (status transitions via RPC only)
--
-- Guard triggers forbid UPDATE/DELETE on immutable tables.

-- ============================================================
-- Extend storyflow_works with version pointers
-- ============================================================

ALTER TABLE public.storyflow_works
  ADD COLUMN IF NOT EXISTS current_version_id uuid,
  ADD COLUMN IF NOT EXISTS latest_checkpoint_id uuid,
  ADD COLUMN IF NOT EXISTS finalized_version_id uuid;

-- ============================================================
-- storyflow_work_versions: immutable version chain
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_work_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  parent_version_id uuid REFERENCES public.storyflow_work_versions(id),
  kind text NOT NULL CHECK (kind IN ('editing_draft','checkpoint','finalized')),
  content_schema text NOT NULL,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  source text NOT NULL CHECK (source IN ('manual','ai','import','restore')),
  source_message_ids text[] NOT NULL DEFAULT '{}',
  source_job_id text,
  idempotency_key text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p1_versions_work
  ON public.storyflow_work_versions(work_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_k22_p1_versions_parent
  ON public.storyflow_work_versions(parent_version_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p1_versions_idempotency
  ON public.storyflow_work_versions(work_id, idempotency_key);

ALTER TABLE public.storyflow_work_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p1_versions_owner_select ON public.storyflow_work_versions;
CREATE POLICY k22_p1_versions_owner_select
  ON public.storyflow_work_versions FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS k22_p1_versions_owner_insert ON public.storyflow_work_versions;
CREATE POLICY k22_p1_versions_owner_insert
  ON public.storyflow_work_versions FOR INSERT
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- Guard trigger: forbid UPDATE and DELETE on work_versions (immutable).
CREATE OR REPLACE FUNCTION public.guard_work_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'work_versions are immutable (kind=%)', OLD.kind
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_update_work_versions ON public.storyflow_work_versions;
CREATE TRIGGER trg_block_update_work_versions
  BEFORE UPDATE ON public.storyflow_work_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_work_versions_immutable();

DROP TRIGGER IF EXISTS trg_block_delete_work_versions ON public.storyflow_work_versions;
CREATE TRIGGER trg_block_delete_work_versions
  BEFORE DELETE ON public.storyflow_work_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_work_versions_immutable();

-- ============================================================
-- append_work_version RPC: atomic version append + CAS pointer update
-- ============================================================

CREATE OR REPLACE FUNCTION public.append_work_version(
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
  SELECT * INTO v_work FROM public.storyflow_works WHERE id = p_work_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORK_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_work.owner_id <> (select auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency: return existing version if key was used.
  IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
    SELECT * INTO v_existing FROM public.storyflow_work_versions
      WHERE work_id = p_work_id AND idempotency_key = p_idempotency_key
      LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RETURN v_existing;
    END IF;
  END IF;

  -- CAS: if expected_current_version_id is provided, the work's current_version_id
  -- must match; otherwise raise CONFLICT.
  IF p_expected_current_version_id IS NOT NULL THEN
    IF v_work.current_version_id IS DISTINCT FROM p_expected_current_version_id THEN
      RAISE EXCEPTION 'VERSION_CONFLICT: expected %, got %',
        p_expected_current_version_id, v_work.current_version_id
        USING ERRCODE = '40001';
    END IF;
  END IF;

  -- Finalize constraint: can only finalize an existing checkpoint or editing_draft
  -- of the same work (not an arbitrary version id).
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

  -- Insert the new version.
  INSERT INTO public.storyflow_work_versions(
    work_id, parent_version_id, kind,
    content_schema, content_json, content_hash,
    source, source_message_ids, source_job_id,
    idempotency_key, created_by
  ) VALUES (
    p_work_id, p_parent_version_id, p_kind,
    p_content_schema, p_content_json, p_content_hash,
    p_source, p_source_message_ids, p_source_job_id,
    COALESCE(p_idempotency_key, 'gen_' || gen_random_uuid()::text),
    (select auth.uid())
  ) RETURNING * INTO v_new;

  -- Update work pointers atomically.
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

REVOKE EXECUTE ON FUNCTION public.append_work_version(
  uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_work_version(
  uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.append_work_version(
  uuid, uuid, text, text, jsonb, text, text, text[], text, text, uuid
) FROM authenticated;

-- ============================================================
-- storyflow_conversation_threads
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_conversation_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p1_threads_work
  ON public.storyflow_conversation_threads(work_id, created_at ASC);

ALTER TABLE public.storyflow_conversation_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p1_threads_owner_select ON public.storyflow_conversation_threads;
CREATE POLICY k22_p1_threads_owner_select
  ON public.storyflow_conversation_threads FOR SELECT
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS k22_p1_threads_owner_insert ON public.storyflow_conversation_threads;
CREATE POLICY k22_p1_threads_owner_insert
  ON public.storyflow_conversation_threads FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

-- ============================================================
-- storyflow_conversation_messages: append-only
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.storyflow_conversation_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  base_version_id uuid REFERENCES public.storyflow_work_versions(id),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p1_messages_thread
  ON public.storyflow_conversation_messages(thread_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p1_messages_idempotency
  ON public.storyflow_conversation_messages(thread_id, idempotency_key);

ALTER TABLE public.storyflow_conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p1_messages_owner_select ON public.storyflow_conversation_messages;
CREATE POLICY k22_p1_messages_owner_select
  ON public.storyflow_conversation_messages FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS k22_p1_messages_owner_insert ON public.storyflow_conversation_messages;
CREATE POLICY k22_p1_messages_owner_insert
  ON public.storyflow_conversation_messages FOR INSERT
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- Guard: messages are append-only (no UPDATE/DELETE).
CREATE OR REPLACE FUNCTION public.guard_messages_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'conversation_messages are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_update_messages ON public.storyflow_conversation_messages;
CREATE TRIGGER trg_block_update_messages
  BEFORE UPDATE ON public.storyflow_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_messages_immutable();

DROP TRIGGER IF EXISTS trg_block_delete_messages ON public.storyflow_conversation_messages;
CREATE TRIGGER trg_block_delete_messages
  BEFORE DELETE ON public.storyflow_conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_messages_immutable();

-- ============================================================
-- storyflow_generation_request_snapshots: append-only
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_generation_request_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  base_version_id uuid NOT NULL REFERENCES public.storyflow_work_versions(id),
  message_ids text[] NOT NULL DEFAULT '{}',
  context_packet_id uuid,
  operation text NOT NULL CHECK (operation IN ('discuss','propose_change','generate','update')),
  idempotency_key text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p1_requests_work
  ON public.storyflow_generation_request_snapshots(work_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p1_requests_idempotency
  ON public.storyflow_generation_request_snapshots(work_id, idempotency_key);

ALTER TABLE public.storyflow_generation_request_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p1_requests_owner_select ON public.storyflow_generation_request_snapshots;
CREATE POLICY k22_p1_requests_owner_select
  ON public.storyflow_generation_request_snapshots FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS k22_p1_requests_owner_insert ON public.storyflow_generation_request_snapshots;
CREATE POLICY k22_p1_requests_owner_insert
  ON public.storyflow_generation_request_snapshots FOR INSERT
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- storyflow_generation_candidates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_generation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.storyflow_generation_request_snapshots(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','applied','rejected','superseded')),
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  applied_version_id uuid REFERENCES public.storyflow_work_versions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_k22_p1_candidates_request
  ON public.storyflow_generation_candidates(request_id);

CREATE INDEX IF NOT EXISTS idx_k22_p1_candidates_work
  ON public.storyflow_generation_candidates(work_id, created_at ASC);

ALTER TABLE public.storyflow_generation_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p1_candidates_owner_select ON public.storyflow_generation_candidates;
CREATE POLICY k22_p1_candidates_owner_select
  ON public.storyflow_generation_candidates FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS k22_p1_candidates_owner_insert ON public.storyflow_generation_candidates;
CREATE POLICY k22_p1_candidates_owner_insert
  ON public.storyflow_generation_candidates FOR INSERT
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- Candidates may be UPDATE'd (status transition) only by the work owner.
DROP POLICY IF EXISTS k22_p1_candidates_owner_update ON public.storyflow_generation_candidates;
CREATE POLICY k22_p1_candidates_owner_update
  ON public.storyflow_generation_candidates FOR UPDATE
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- apply_candidate RPC: atomic candidate→applied + new Work Version
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_generation_candidate(
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
  v_new_version public.storyflow_work_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_candidate FROM public.storyflow_generation_candidates
    WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT * INTO v_work FROM public.storyflow_works WHERE id = v_candidate.work_id;
  IF v_work.owner_id <> (select auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Idempotency: if already applied, return the existing version.
  IF v_candidate.status = 'applied' AND v_candidate.applied_version_id IS NOT NULL THEN
    RETURN QUERY SELECT v_candidate.id, v_candidate.applied_version_id;
    RETURN;
  END IF;

  IF v_candidate.status <> 'ready' THEN
    RAISE EXCEPTION 'CANDIDATE_NOT_READY: status=%', v_candidate.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Create new Work Version (editing_draft) from candidate content.
  INSERT INTO public.storyflow_work_versions(
    work_id, parent_version_id, kind,
    content_schema, content_json, content_hash,
    source, source_message_ids, source_job_id,
    idempotency_key, created_by
  ) VALUES (
    v_candidate.work_id, v_work.current_version_id, 'editing_draft',
    p_content_schema, v_candidate.content_json, v_candidate.content_hash,
    'ai', '{}'::text[], NULL,
    p_idempotency_key, (select auth.uid())
  ) RETURNING * INTO v_new_version;

  -- Mark candidate as applied.
  UPDATE public.storyflow_generation_candidates SET
    status = 'applied',
    applied_version_id = v_new_version.id,
    applied_at = now()
  WHERE id = v_candidate.id;

  -- Update work current_version_id.
  UPDATE public.storyflow_works SET
    current_version_id = v_new_version.id,
    updated_at = now()
  WHERE id = v_candidate.work_id;

  RETURN QUERY SELECT v_candidate.id, v_new_version.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_generation_candidate(uuid, text, text)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_generation_candidate(uuid, text, text)
  FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_generation_candidate(uuid, text, text)
  FROM authenticated;

COMMENT ON TABLE public.storyflow_work_versions IS 'K22-P1 immutable Work version chain. Guard triggers forbid UPDATE/DELETE.';
COMMENT ON TABLE public.storyflow_conversation_threads IS 'K22-P1 conversation thread per Work.';
COMMENT ON TABLE public.storyflow_conversation_messages IS 'K22-P1 append-only conversation messages. Guard triggers forbid UPDATE/DELETE.';
COMMENT ON TABLE public.storyflow_generation_request_snapshots IS 'K22-P1 generation request snapshots (append-only).';
COMMENT ON TABLE public.storyflow_generation_candidates IS 'K22-P1 generation candidates. Status transitions via apply_generation_candidate RPC.';
COMMENT ON FUNCTION public.append_work_version IS 'K22-P1 atomic version append + CAS pointer update. SECURITY DEFINER; only service role.';
COMMENT ON FUNCTION public.apply_generation_candidate IS 'K22-P1 atomic candidate→applied + new Work Version. SECURITY DEFINER; only service role.';

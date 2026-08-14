-- K22-P2 Task 2.2: Universe inheritance — Version chain, Manifest, Snapshot, Local State.
-- Forward-only, additive.
--
-- Builds on:
--   storyflow_works (K22-P0) + version pointers (K22-P1)
--   storyflow_universes / storyflow_universe_entities /
--   storyflow_universe_relationships / storyflow_universe_timeline_events /
--   storyflow_canon_facts (baseline)
--   storyflow_v2_assets (K2-C-07)
--   storyflow_universe_inheritance_snapshots (legacy K2-C-03) is left untouched;
--   this migration adds a Work-scoped successor table with the same name prefix
--   `storyflow_work_inheritance_snapshots` to avoid collision.
--
-- Tables added:
--   storyflow_universe_versions (immutable append-only)
--   storyflow_work_inheritance_manifests (one active per work; supersede via RPC)
--   storyflow_work_inheritance_snapshots (immutable object snapshot at bind time)
--   storyflow_work_local_states (CAS revision local patch overlay)
--
-- RPCs added:
--   compute_universe_version_hash(...) -> sha256 text
--   bind_work_to_universe_v22(...) -> new manifest row (atomic)
--
-- Guard triggers forbid UPDATE/DELETE on immutable tables.

-- ============================================================
-- storyflow_universe_versions: immutable Universe Version chain
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_universe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  universe_id uuid NOT NULL REFERENCES public.storyflow_universes(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  content_hash text NOT NULL,
  object_index jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_k22_p2_universe_versions_no UNIQUE (universe_id, version_no),
  CONSTRAINT uq_k22_p2_universe_versions_hash UNIQUE (universe_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_k22_p2_universe_versions_universe
  ON public.storyflow_universe_versions(universe_id, created_at ASC);

ALTER TABLE public.storyflow_universe_versions ENABLE ROW LEVEL SECURITY;

-- Universe owner OR team member may read versions.
DROP POLICY IF EXISTS k22_p2_universe_versions_select ON public.storyflow_universe_versions;
CREATE POLICY k22_p2_universe_versions_select
  ON public.storyflow_universe_versions FOR SELECT
  USING (
    universe_id IN (
      SELECT u.id FROM public.storyflow_universes u
      WHERE u.user_id = (select auth.uid())
         OR (u.team_id IS NOT NULL AND public.is_team_member(u.team_id, (select auth.uid())))
    )
  );

DROP POLICY IF EXISTS k22_p2_universe_versions_insert ON public.storyflow_universe_versions;
CREATE POLICY k22_p2_universe_versions_insert
  ON public.storyflow_universe_versions FOR INSERT
  WITH CHECK (
    universe_id IN (
      SELECT u.id FROM public.storyflow_universes u
      WHERE u.user_id = (select auth.uid())
         OR (u.team_id IS NOT NULL AND public.is_team_member(u.team_id, (select auth.uid())))
    )
  );

-- Guard trigger: forbid UPDATE and DELETE on universe_versions (immutable).
CREATE OR REPLACE FUNCTION public.guard_universe_versions_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'universe_versions are immutable (universe_id=%, version_no=%)', OLD.universe_id, OLD.version_no
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_update_universe_versions ON public.storyflow_universe_versions;
CREATE TRIGGER trg_block_update_universe_versions
  BEFORE UPDATE ON public.storyflow_universe_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_universe_versions_immutable();

DROP TRIGGER IF EXISTS trg_block_delete_universe_versions ON public.storyflow_universe_versions;
CREATE TRIGGER trg_block_delete_universe_versions
  BEFORE DELETE ON public.storyflow_universe_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_universe_versions_immutable();

-- ============================================================
-- storyflow_work_inheritance_manifests: active Manifest per Work
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_work_inheritance_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  universe_id uuid NOT NULL REFERENCES public.storyflow_universes(id) ON DELETE CASCADE,
  universe_version_id uuid NOT NULL REFERENCES public.storyflow_universe_versions(id) ON DELETE RESTRICT,
  relation text NOT NULL CHECK (relation IN ('canon_continuation','prequel','sequel','spinoff','adaptation','parallel')),
  timeline_anchor_id text,
  canon_policy text NOT NULL CHECK (canon_policy IN ('strict','flexible','reference_only')),
  included_entity_version_ids text[] NOT NULL DEFAULT '{}',
  included_fact_version_ids text[] NOT NULL DEFAULT '{}',
  included_relationship_version_ids text[] NOT NULL DEFAULT '{}',
  included_timeline_event_version_ids text[] NOT NULL DEFAULT '{}',
  included_asset_version_ids text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES public.storyflow_work_inheritance_manifests(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p2_manifests_work
  ON public.storyflow_work_inheritance_manifests(work_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_k22_p2_manifests_universe_version
  ON public.storyflow_work_inheritance_manifests(universe_version_id);

-- Only one active manifest per work.
CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p2_manifests_active_per_work
  ON public.storyflow_work_inheritance_manifests(work_id) WHERE is_active = true;

ALTER TABLE public.storyflow_work_inheritance_manifests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p2_manifests_owner_select ON public.storyflow_work_inheritance_manifests;
CREATE POLICY k22_p2_manifests_owner_select
  ON public.storyflow_work_inheritance_manifests FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS k22_p2_manifests_owner_insert ON public.storyflow_work_inheritance_manifests;
CREATE POLICY k22_p2_manifests_owner_insert
  ON public.storyflow_work_inheritance_manifests FOR INSERT
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- Supersede updates (is_active, superseded_by) are performed only by the
-- SECURITY DEFINER RPC `bind_work_to_universe_v22`; no UPDATE RLS policy is
-- granted to direct client roles. The RPC bypasses RLS as the table owner.

-- ============================================================
-- storyflow_work_inheritance_snapshots: immutable object snapshot at bind time
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_work_inheritance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES public.storyflow_work_inheritance_manifests(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  universe_version_id uuid NOT NULL REFERENCES public.storyflow_universe_versions(id) ON DELETE RESTRICT,
  snapshot_hash text NOT NULL,
  object_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p2_snapshots_manifest
  ON public.storyflow_work_inheritance_snapshots(manifest_id);

CREATE INDEX IF NOT EXISTS idx_k22_p2_snapshots_work
  ON public.storyflow_work_inheritance_snapshots(work_id, created_at DESC);

ALTER TABLE public.storyflow_work_inheritance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p2_snapshots_owner_select ON public.storyflow_work_inheritance_snapshots;
CREATE POLICY k22_p2_snapshots_owner_select
  ON public.storyflow_work_inheritance_snapshots FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- Guard trigger: forbid UPDATE and DELETE on snapshots (immutable).
CREATE OR REPLACE FUNCTION public.guard_inheritance_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'work_inheritance_snapshots are immutable (manifest_id=%)', OLD.manifest_id
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_update_inheritance_snapshots ON public.storyflow_work_inheritance_snapshots;
CREATE TRIGGER trg_block_update_inheritance_snapshots
  BEFORE UPDATE ON public.storyflow_work_inheritance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_inheritance_snapshots_immutable();

DROP TRIGGER IF EXISTS trg_block_delete_inheritance_snapshots ON public.storyflow_work_inheritance_snapshots;
CREATE TRIGGER trg_block_delete_inheritance_snapshots
  BEFORE DELETE ON public.storyflow_work_inheritance_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.guard_inheritance_snapshots_immutable();

-- ============================================================
-- storyflow_work_local_states: Work local change overlay (CAS revision)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_work_local_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  base_manifest_id uuid NOT NULL REFERENCES public.storyflow_work_inheritance_manifests(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('entity','fact','relationship','timeline_event','asset')),
  entity_id text NOT NULL,
  patch_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p2_local_states_active
  ON public.storyflow_work_local_states(work_id, entity_type, entity_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_k22_p2_local_states_manifest
  ON public.storyflow_work_local_states(base_manifest_id);

ALTER TABLE public.storyflow_work_local_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p2_local_states_owner_select ON public.storyflow_work_local_states;
CREATE POLICY k22_p2_local_states_owner_select
  ON public.storyflow_work_local_states FOR SELECT
  USING (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS k22_p2_local_states_owner_insert ON public.storyflow_work_local_states;
CREATE POLICY k22_p2_local_states_owner_insert
  ON public.storyflow_work_local_states FOR INSERT
  WITH CHECK (
    work_id IN (
      SELECT w.id FROM public.storyflow_works w
      WHERE w.owner_id = (select auth.uid())
    )
  );

-- Owner may UPDATE only patch_json, revision, updated_at, status. The column
-- whitelist is enforced by a BEFORE UPDATE guard trigger; RLS only gates rows.
DROP POLICY IF EXISTS k22_p2_local_states_owner_update ON public.storyflow_work_local_states;
CREATE POLICY k22_p2_local_states_owner_update
  ON public.storyflow_work_local_states FOR UPDATE
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

CREATE OR REPLACE FUNCTION public.guard_local_states_column_whitelist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only patch_json, revision, updated_at, status may change. All other
  -- columns (including id, work_id, base_manifest_id, entity_type, entity_id,
  -- created_by, created_at) must remain stable across UPDATEs.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.work_id IS DISTINCT FROM OLD.work_id
     OR NEW.base_manifest_id IS DISTINCT FROM OLD.base_manifest_id
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'work_local_states: only (patch_json, revision, updated_at, status) may change'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_local_states_column_whitelist ON public.storyflow_work_local_states;
CREATE TRIGGER trg_local_states_column_whitelist
  BEFORE UPDATE ON public.storyflow_work_local_states
  FOR EACH ROW EXECUTE FUNCTION public.guard_local_states_column_whitelist();

-- ============================================================
-- compute_universe_version_hash RPC: deterministic SHA-256 of included Canon objects
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_universe_version_hash(
  p_universe_id uuid,
  p_entity_ids text[] DEFAULT '{}',
  p_fact_ids text[] DEFAULT '{}',
  p_relationship_ids text[] DEFAULT '{}',
  p_timeline_event_ids text[] DEFAULT '{}',
  p_asset_ids text[] DEFAULT '{}'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical jsonb;
  v_hash text;
BEGIN
  -- Build a canonical JSON document of the included objects.
  -- updatedAt / createdAt / user_id / source_project_id / non-content fields
  -- are stripped so that the hash reflects semantic content only.
  SELECT jsonb_build_object(
    'universe_id', p_universe_id,
    'entities', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', e.id, 'type', e.type, 'name', e.name, 'summary', e.summary,
          'details_json', e.details_json, 'status', e.status, 'tags', e.tags
        ) ORDER BY e.id
      )
      FROM public.storyflow_universe_entities e
      WHERE e.universe_id = p_universe_id
        AND e.id = ANY(p_entity_ids::uuid[])
    ), '[]'::jsonb),
    'facts', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', f.id, 'fact_text', f.fact_text, 'category', f.category,
          'importance', f.importance, 'status', f.status, 'is_locked', f.is_locked
        ) ORDER BY f.id
      )
      FROM public.storyflow_canon_facts f
      WHERE f.universe_id = p_universe_id
        AND f.id = ANY(p_fact_ids::uuid[])
    ), '[]'::jsonb),
    'relationships', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', r.id, 'source_entity_id', r.source_entity_id,
          'target_entity_id', r.target_entity_id,
          'relationship_type', r.relationship_type,
          'relationship_status', r.relationship_status,
          'summary', r.summary, 'history_json', r.history_json, 'status', r.status
        ) ORDER BY r.id
      )
      FROM public.storyflow_universe_relationships r
      WHERE r.universe_id = p_universe_id
        AND r.id = ANY(p_relationship_ids::uuid[])
    ), '[]'::jsonb),
    'timeline_events', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'title', t.title, 'description', t.description,
          'date_label', t.date_label, 'season_number', t.season_number,
          'episode_number', t.episode_number, 'order_index', t.order_index,
          'related_entity_ids', t.related_entity_ids, 'is_canon', t.is_canon,
          'status', t.status
        ) ORDER BY t.id
      )
      FROM public.storyflow_universe_timeline_events t
      WHERE t.universe_id = p_universe_id
        AND t.id = ANY(p_timeline_event_ids::uuid[])
    ), '[]'::jsonb),
    'assets', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id, 'kind', a.kind, 'name', a.name, 'status', a.status,
          'rights_state', a.rights_state, 'metadata', a.metadata
        ) ORDER BY a.id
      )
      FROM public.storyflow_v2_assets a
      WHERE a.id = ANY(p_asset_ids::uuid[])
    ), '[]'::jsonb)
  ) INTO v_canonical;

  v_hash := encode(digest(v_canonical::text, 'sha256'), 'hex');
  RETURN v_hash;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_universe_version_hash(
  uuid, text[], text[], text[], text[], text[]
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.compute_universe_version_hash(
  uuid, text[], text[], text[], text[], text[]
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_universe_version_hash(
  uuid, text[], text[], text[], text[], text[]
) FROM authenticated;

-- ============================================================
-- bind_work_to_universe_v22 RPC: atomic bind (Manifest + Snapshot)
-- ============================================================

CREATE OR REPLACE FUNCTION public.bind_work_to_universe_v22(
  p_work_id uuid,
  p_universe_id uuid,
  p_relation text,
  p_canon_policy text,
  p_timeline_anchor_id text DEFAULT NULL,
  p_included_entity_ids text[] DEFAULT '{}',
  p_included_fact_ids text[] DEFAULT '{}',
  p_included_relationship_ids text[] DEFAULT '{}',
  p_included_timeline_event_ids text[] DEFAULT '{}',
  p_included_asset_ids text[] DEFAULT '{}',
  p_caller_id uuid DEFAULT NULL
) RETURNS public.storyflow_work_inheritance_manifests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work public.storyflow_works%ROWTYPE;
  v_universe public.storyflow_universes%ROWTYPE;
  v_caller uuid := COALESCE(p_caller_id, (select auth.uid()));
  v_content_hash text;
  v_version public.storyflow_universe_versions%ROWTYPE;
  v_next_version_no integer;
  v_object_index jsonb;
  v_object_snapshot jsonb;
  v_existing_active_id uuid;
  v_new_manifest public.storyflow_work_inheritance_manifests%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'MISSING_CALLER' USING ERRCODE = 'not_null_violation';
  END IF;

  IF p_relation NOT IN ('canon_continuation','prequel','sequel','spinoff','adaptation','parallel') THEN
    RAISE EXCEPTION 'INVALID_RELATION: %', p_relation USING ERRCODE = 'check_violation';
  END IF;
  IF p_canon_policy NOT IN ('strict','flexible','reference_only') THEN
    RAISE EXCEPTION 'INVALID_CANON_POLICY: %', p_canon_policy USING ERRCODE = 'check_violation';
  END IF;

  -- Work must exist and be owned by the caller.
  SELECT * INTO v_work FROM public.storyflow_works WHERE id = p_work_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORK_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_work.owner_id <> v_caller THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Universe must exist and caller must be owner or active team member.
  SELECT * INTO v_universe FROM public.storyflow_universes WHERE id = p_universe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNIVERSE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_universe.user_id <> v_caller
     AND NOT public.is_team_member(v_universe.team_id, v_caller) THEN
    RAISE EXCEPTION 'UNIVERSE_ACCESS_DENIED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validate included entity IDs belong to the universe.
  IF array_length(p_included_entity_ids, 1) IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_included_entity_ids::uuid[]) AS eid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.storyflow_universe_entities e
        WHERE e.id = eid AND e.universe_id = p_universe_id
      )
    ) THEN
      RAISE EXCEPTION 'ENTITY_NOT_IN_UNIVERSE' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Validate included fact IDs belong to the universe.
  IF array_length(p_included_fact_ids, 1) IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_included_fact_ids::uuid[]) AS fid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.storyflow_canon_facts f
        WHERE f.id = fid AND f.universe_id = p_universe_id
      )
    ) THEN
      RAISE EXCEPTION 'FACT_NOT_IN_UNIVERSE' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Validate included relationship IDs belong to the universe.
  IF array_length(p_included_relationship_ids, 1) IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_included_relationship_ids::uuid[]) AS rid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.storyflow_universe_relationships r
        WHERE r.id = rid AND r.universe_id = p_universe_id
      )
    ) THEN
      RAISE EXCEPTION 'RELATIONSHIP_NOT_IN_UNIVERSE' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Validate included timeline event IDs belong to the universe.
  IF array_length(p_included_timeline_event_ids, 1) IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_included_timeline_event_ids::uuid[]) AS tid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.storyflow_universe_timeline_events t
        WHERE t.id = tid AND t.universe_id = p_universe_id
      )
    ) THEN
      RAISE EXCEPTION 'TIMELINE_EVENT_NOT_IN_UNIVERSE' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Assets are not directly universe-scoped in the current schema; validate
  -- they at least exist as v2 assets.
  IF array_length(p_included_asset_ids, 1) IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(p_included_asset_ids::uuid[]) AS aid
      WHERE NOT EXISTS (
        SELECT 1 FROM public.storyflow_v2_assets a WHERE a.id = aid
      )
    ) THEN
      RAISE EXCEPTION 'ASSET_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  -- Compute content_hash for the included object set.
  v_content_hash := public.compute_universe_version_hash(
    p_universe_id,
    p_included_entity_ids,
    p_included_fact_ids,
    p_included_relationship_ids,
    p_included_timeline_event_ids,
    p_included_asset_ids
  );

  -- Find-or-create Universe Version (idempotent by content_hash).
  SELECT * INTO v_version FROM public.storyflow_universe_versions
    WHERE universe_id = p_universe_id AND content_hash = v_content_hash
    LIMIT 1;

  IF v_version IS NULL THEN
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version_no
      FROM public.storyflow_universe_versions
      WHERE universe_id = p_universe_id;

    v_object_index := jsonb_build_object(
      'entities', to_jsonb(p_included_entity_ids),
      'facts', to_jsonb(p_included_fact_ids),
      'relationships', to_jsonb(p_included_relationship_ids),
      'timelineEvents', to_jsonb(p_included_timeline_event_ids),
      'assets', to_jsonb(p_included_asset_ids)
    );

    INSERT INTO public.storyflow_universe_versions(
      universe_id, version_no, content_hash, object_index, created_by
    ) VALUES (
      p_universe_id, v_next_version_no, v_content_hash, v_object_index, v_caller
    ) RETURNING * INTO v_version;
  END IF;

  -- Build the immutable object snapshot (full content of included objects).
  v_object_snapshot := jsonb_build_object(
    'universe_id', p_universe_id,
    'universe_version_id', v_version.id,
    'entities', COALESCE((
      SELECT jsonb_agg(to_jsonb(e)
        - 'created_at' - 'updated_at' - 'user_id'
        - 'source_project_id' - 'source_step_id' ORDER BY e.id)
      FROM public.storyflow_universe_entities e
      WHERE e.universe_id = p_universe_id
        AND e.id = ANY(p_included_entity_ids::uuid[])
    ), '[]'::jsonb),
    'facts', COALESCE((
      SELECT jsonb_agg(to_jsonb(f)
        - 'created_at' - 'updated_at' - 'user_id'
        - 'source_project_id' - 'source_episode' - 'source_location_text'
        - 'confirmed_by_user' - 'confirmed_at' ORDER BY f.id)
      FROM public.storyflow_canon_facts f
      WHERE f.universe_id = p_universe_id
        AND f.id = ANY(p_included_fact_ids::uuid[])
    ), '[]'::jsonb),
    'relationships', COALESCE((
      SELECT jsonb_agg(to_jsonb(r)
        - 'created_at' - 'updated_at' - 'user_id' - 'source_project_id' ORDER BY r.id)
      FROM public.storyflow_universe_relationships r
      WHERE r.universe_id = p_universe_id
        AND r.id = ANY(p_included_relationship_ids::uuid[])
    ), '[]'::jsonb),
    'timeline_events', COALESCE((
      SELECT jsonb_agg(to_jsonb(t)
        - 'created_at' - 'updated_at' - 'user_id' - 'source_project_id' ORDER BY t.id)
      FROM public.storyflow_universe_timeline_events t
      WHERE t.universe_id = p_universe_id
        AND t.id = ANY(p_included_timeline_event_ids::uuid[])
    ), '[]'::jsonb),
    'assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a)
        - 'created_at' - 'updated_at' - 'owner_id' - 'project_id' - 'actor_id' ORDER BY a.id)
      FROM public.storyflow_v2_assets a
      WHERE a.id = ANY(p_included_asset_ids::uuid[])
    ), '[]'::jsonb)
  );

  -- Supersede any existing active manifest for this work. Setting is_active
  -- to false releases the partial unique slot (work_id WHERE is_active = true)
  -- so the new insert below does not collide. Supersede — not delete — so the
  -- prior manifest row is preserved for history. Updates are performed by this
  -- SECURITY DEFINER RPC (which bypasses RLS); no direct UPDATE RLS policy is
  -- granted to client roles.
  UPDATE public.storyflow_work_inheritance_manifests
    SET is_active = false
  WHERE work_id = p_work_id AND is_active = true
  RETURNING id INTO v_existing_active_id;

  -- Insert the new active manifest.
  INSERT INTO public.storyflow_work_inheritance_manifests(
    work_id, universe_id, universe_version_id,
    relation, timeline_anchor_id, canon_policy,
    included_entity_version_ids, included_fact_version_ids,
    included_relationship_version_ids, included_timeline_event_version_ids,
    included_asset_version_ids, is_active, superseded_by, created_by
  ) VALUES (
    p_work_id, p_universe_id, v_version.id,
    p_relation, p_timeline_anchor_id, p_canon_policy,
    p_included_entity_ids, p_included_fact_ids,
    p_included_relationship_ids, p_included_timeline_event_ids,
    p_included_asset_ids, true, NULL, v_caller
  ) RETURNING * INTO v_new_manifest;

  -- Backfill superseded_by on the prior manifest.
  IF v_existing_active_id IS NOT NULL THEN
    UPDATE public.storyflow_work_inheritance_manifests
      SET superseded_by = v_new_manifest.id
    WHERE id = v_existing_active_id;
  END IF;

  -- Insert the immutable snapshot for the new manifest.
  INSERT INTO public.storyflow_work_inheritance_snapshots(
    manifest_id, work_id, universe_version_id,
    snapshot_hash, object_snapshot
  ) VALUES (
    v_new_manifest.id, p_work_id, v_version.id,
    v_content_hash, v_object_snapshot
  );

  RETURN v_new_manifest;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bind_work_to_universe_v22(
  uuid, uuid, text, text, text, text[], text[], text[], text[], text[], uuid
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bind_work_to_universe_v22(
  uuid, uuid, text, text, text, text[], text[], text[], text[], text[], uuid
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bind_work_to_universe_v22(
  uuid, uuid, text, text, text, text[], text[], text[], text[], text[], uuid
) FROM authenticated;

COMMENT ON TABLE public.storyflow_universe_versions IS 'K22-P2 immutable Universe Version chain. Same content_hash reuses the same version. Guard triggers forbid UPDATE/DELETE.';
COMMENT ON TABLE public.storyflow_work_inheritance_manifests IS 'K22-P2 Work inheritance manifest. Only one active per work (partial unique index). Supersede via bind_work_to_universe_v22 RPC.';
COMMENT ON TABLE public.storyflow_work_inheritance_snapshots IS 'K22-P2 immutable object snapshot bound at manifest creation. Guard triggers forbid UPDATE/DELETE.';
COMMENT ON TABLE public.storyflow_work_local_states IS 'K22-P2 Work-local patch overlay (CAS revision). Column whitelist enforced by trigger.';
COMMENT ON FUNCTION public.compute_universe_version_hash IS 'K22-P2 deterministic SHA-256 over included Canon objects. SECURITY DEFINER; only service role.';
COMMENT ON FUNCTION public.bind_work_to_universe_v22 IS 'K22-P2 atomic Work→Universe bind: validates access + object ownership, finds-or-creates Universe Version, creates Manifest + Snapshot, supersedes prior active manifest. SECURITY DEFINER; only service role.';

-- K22-P3 Task 3.2: Screenplay Studio — unit identity, immutable unit versions,
-- dependency edges and stale resolutions.
-- Forward-only, additive.
--
-- Builds on:
--   storyflow_works (K22-P0) + version pointers (K22-P1)
--   storyflow_work_versions (K22-P1) — Work-level versions stay authoritative
--   for whole-document snapshots; unit versions below are the fine-grained
--   screenplay layer referenced by Work Versions.
--
-- Tables added:
--   storyflow_screenplay_units (identity: title/order/parent; content-free)
--   storyflow_screenplay_unit_versions (immutable, append-only)
--   storyflow_screenplay_dependency_edges (source/target unit version + state)
--   storyflow_stale_resolutions (evidence trail for stale dispositions)
--
-- Guard triggers forbid UPDATE/DELETE on immutable unit versions.

-- ============================================================
-- storyflow_screenplay_units: unit identity
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_screenplay_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('world','character','outline','episode','scene')),
  parent_id uuid REFERENCES public.storyflow_screenplay_units(id) ON DELETE SET NULL,
  order_index integer NOT NULL CHECK (order_index >= 0),
  title text NOT NULL DEFAULT '',
  readiness text NOT NULL DEFAULT 'empty' CHECK (readiness IN ('empty','draft','checkpoint','finalized')),
  current_version_id uuid,
  finalized_version_id uuid,
  legacy_id text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_k22_p3_units_legacy UNIQUE (work_id, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_units_work
  ON public.storyflow_screenplay_units(work_id, type, order_index ASC);

ALTER TABLE public.storyflow_screenplay_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_units_select ON public.storyflow_screenplay_units;
CREATE POLICY k22_p3_units_select
  ON public.storyflow_screenplay_units FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_units_insert ON public.storyflow_screenplay_units;
CREATE POLICY k22_p3_units_insert
  ON public.storyflow_screenplay_units FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_units_update ON public.storyflow_screenplay_units;
CREATE POLICY k22_p3_units_update
  ON public.storyflow_screenplay_units FOR UPDATE
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

-- ============================================================
-- storyflow_screenplay_unit_versions: immutable append-only content
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_screenplay_unit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.storyflow_screenplay_units(id) ON DELETE CASCADE,
  parent_version_id uuid REFERENCES public.storyflow_screenplay_unit_versions(id),
  content_schema text NOT NULL DEFAULT 'kiikis.screenplay-unit/1',
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','import','restore')),
  source_message_ids text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_unit_versions_unit
  ON public.storyflow_screenplay_unit_versions(unit_id, created_at ASC);

ALTER TABLE public.storyflow_screenplay_unit_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_unit_versions_select ON public.storyflow_screenplay_unit_versions;
CREATE POLICY k22_p3_unit_versions_select
  ON public.storyflow_screenplay_unit_versions FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_unit_versions_insert ON public.storyflow_screenplay_unit_versions;
CREATE POLICY k22_p3_unit_versions_insert
  ON public.storyflow_screenplay_unit_versions FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

-- Immutability: unit versions can never be updated or deleted.
CREATE OR REPLACE FUNCTION public.k22_p3_unit_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'storyflow_screenplay_unit_versions is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_k22_p3_unit_versions_immutable ON public.storyflow_screenplay_unit_versions;
CREATE TRIGGER trg_k22_p3_unit_versions_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_screenplay_unit_versions
  FOR EACH ROW EXECUTE FUNCTION public.k22_p3_unit_versions_immutable();

-- ============================================================
-- storyflow_screenplay_dependency_edges: upstream reference facts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_screenplay_dependency_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  source_unit_id uuid NOT NULL REFERENCES public.storyflow_screenplay_units(id) ON DELETE CASCADE,
  source_unit_version_id uuid NOT NULL REFERENCES public.storyflow_screenplay_unit_versions(id),
  target_unit_id uuid NOT NULL REFERENCES public.storyflow_screenplay_units(id) ON DELETE CASCADE,
  target_unit_version_id uuid NOT NULL REFERENCES public.storyflow_screenplay_unit_versions(id),
  state text NOT NULL DEFAULT 'current' CHECK (state IN ('current','stale','acknowledged','conflict')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_edges_work
  ON public.storyflow_screenplay_dependency_edges(work_id, state);
CREATE INDEX IF NOT EXISTS idx_k22_p3_edges_target
  ON public.storyflow_screenplay_dependency_edges(target_unit_id, target_unit_version_id);

ALTER TABLE public.storyflow_screenplay_dependency_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_edges_select ON public.storyflow_screenplay_dependency_edges;
CREATE POLICY k22_p3_edges_select
  ON public.storyflow_screenplay_dependency_edges FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_edges_insert ON public.storyflow_screenplay_dependency_edges;
CREATE POLICY k22_p3_edges_insert
  ON public.storyflow_screenplay_dependency_edges FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_edges_update ON public.storyflow_screenplay_dependency_edges;
CREATE POLICY k22_p3_edges_update
  ON public.storyflow_screenplay_dependency_edges FOR UPDATE
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

-- ============================================================
-- storyflow_stale_resolutions: evidence trail for stale dispositions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_stale_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  upstream_unit_id uuid NOT NULL REFERENCES public.storyflow_screenplay_units(id) ON DELETE CASCADE,
  downstream_unit_id uuid NOT NULL REFERENCES public.storyflow_screenplay_units(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('keep_old','regenerate','manual_revise','confirm_no_impact')),
  note text NOT NULL DEFAULT '',
  resolved_by uuid NOT NULL REFERENCES auth.users(id),
  resolved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_resolutions_work
  ON public.storyflow_stale_resolutions(work_id, resolved_at DESC);

ALTER TABLE public.storyflow_stale_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_resolutions_select ON public.storyflow_stale_resolutions;
CREATE POLICY k22_p3_resolutions_select
  ON public.storyflow_stale_resolutions FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_resolutions_insert ON public.storyflow_stale_resolutions;
CREATE POLICY k22_p3_resolutions_insert
  ON public.storyflow_stale_resolutions FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

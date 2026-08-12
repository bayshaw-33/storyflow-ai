-- K2-C-03: project primary-Universe binding history and immutable inheritance snapshots.
-- Additive and re-runnable; no existing project or asset rows are deleted.

CREATE TABLE IF NOT EXISTS public.storyflow_universe_binding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  universe_id UUID NOT NULL REFERENCES public.storyflow_universes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('bound', 'unbound')),
  source_link_id UUID REFERENCES public.storyflow_universe_project_links(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_k2_c03_binding_history_project
  ON public.storyflow_universe_binding_history(project_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.storyflow_universe_inheritance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES public.storyflow_projects(id) ON DELETE CASCADE,
  universe_id UUID NOT NULL REFERENCES public.storyflow_universes(id) ON DELETE CASCADE,
  universe_version TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k2_c03_snapshots_project
  ON public.storyflow_universe_inheritance_snapshots(project_id, created_at DESC);

ALTER TABLE public.storyflow_universe_project_links
  ADD COLUMN IF NOT EXISTS unbound_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_k2_c03_active_project_primary_universe
  ON public.storyflow_universe_project_links(project_id)
  WHERE unbound_at IS NULL;

ALTER TABLE public.storyflow_universe_binding_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storyflow_universe_inheritance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k2_c03_binding_history_owner_select ON public.storyflow_universe_binding_history;
CREATE POLICY k2_c03_binding_history_owner_select
  ON public.storyflow_universe_binding_history FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS k2_c03_snapshots_owner_select ON public.storyflow_universe_inheritance_snapshots;
CREATE POLICY k2_c03_snapshots_owner_select
  ON public.storyflow_universe_inheritance_snapshots FOR SELECT
  USING (created_by = (select auth.uid()));

COMMENT ON TABLE public.storyflow_universe_binding_history IS 'K2-C-03 immutable project/Universe bind and unbind history.';
COMMENT ON TABLE public.storyflow_universe_inheritance_snapshots IS 'K2-C-03 immutable project-time Universe inheritance payloads.';

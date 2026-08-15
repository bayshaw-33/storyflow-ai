-- K22-P3 Task 3.5: Screenplay continuity — incremental reference index,
-- localized findings and disposition evidence.
-- Forward-only, additive.

-- ============================================================
-- storyflow_continuity_index: per-unit-version term index (incremental)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_continuity_index (
  id text PRIMARY KEY,
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.storyflow_screenplay_units(id) ON DELETE CASCADE,
  unit_version_id uuid NOT NULL REFERENCES public.storyflow_screenplay_unit_versions(id),
  term text NOT NULL,
  term_start integer NOT NULL DEFAULT 0,
  term_end integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_continuity_work
  ON public.storyflow_continuity_index(work_id, term);
CREATE INDEX IF NOT EXISTS idx_k22_p3_continuity_unit
  ON public.storyflow_continuity_index(unit_id);

ALTER TABLE public.storyflow_continuity_index ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_continuity_index_select ON public.storyflow_continuity_index;
CREATE POLICY k22_p3_continuity_index_select
  ON public.storyflow_continuity_index FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_continuity_index_write ON public.storyflow_continuity_index;
CREATE POLICY k22_p3_continuity_index_write
  ON public.storyflow_continuity_index FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_continuity_index_delete ON public.storyflow_continuity_index;
CREATE POLICY k22_p3_continuity_index_delete
  ON public.storyflow_continuity_index FOR DELETE
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

-- ============================================================
-- storyflow_continuity_findings: localized conflicts (append + status only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_continuity_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error')),
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ignored','revised','candidate_created')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_findings_work
  ON public.storyflow_continuity_findings(work_id, status, created_at DESC);

ALTER TABLE public.storyflow_continuity_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_findings_select ON public.storyflow_continuity_findings;
CREATE POLICY k22_p3_findings_select
  ON public.storyflow_continuity_findings FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_findings_insert ON public.storyflow_continuity_findings;
CREATE POLICY k22_p3_findings_insert
  ON public.storyflow_continuity_findings FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_findings_update ON public.storyflow_continuity_findings;
CREATE POLICY k22_p3_findings_update
  ON public.storyflow_continuity_findings FOR UPDATE
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

-- ============================================================
-- storyflow_evidence_events: disposition evidence (append-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_evidence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p3_evidence_work
  ON public.storyflow_evidence_events(work_id, created_at DESC);

ALTER TABLE public.storyflow_evidence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p3_evidence_select ON public.storyflow_evidence_events;
CREATE POLICY k22_p3_evidence_select
  ON public.storyflow_evidence_events FOR SELECT
  USING (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p3_evidence_insert ON public.storyflow_evidence_events;
CREATE POLICY k22_p3_evidence_insert
  ON public.storyflow_evidence_events FOR INSERT
  WITH CHECK (work_id IN (SELECT w.id FROM public.storyflow_works w WHERE w.owner_id = (select auth.uid())));

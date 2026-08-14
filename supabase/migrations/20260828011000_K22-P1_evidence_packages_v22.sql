-- K22-P1 Task 1.4: Evidence packages V2.2 storage table.
--
-- Stores materialized V2.2 evidence packages keyed by manifestHash for
-- idempotent re-requests. V1 packages continue to use storyflow_evidence_packages
-- (legacy route /api/evidence/packages remains unchanged).
--
-- Forward-only, additive.

-- ============================================================
-- storyflow_evidence_packages_v22
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_evidence_packages_v22 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  work_id uuid NOT NULL REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  manifest_hash text NOT NULL,
  package_sha256 text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','pending','failed')),
  file_count integer NOT NULL DEFAULT 0,
  total_byte_size bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: one package per manifestHash (same facts → same package).
CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p1_evidence_v22_manifest
  ON public.storyflow_evidence_packages_v22(manifest_hash);

-- Owner lookup (most recent first).
CREATE INDEX IF NOT EXISTS idx_k22_p1_evidence_v22_owner
  ON public.storyflow_evidence_packages_v22(owner_id, created_at DESC);

-- Work lookup.
CREATE INDEX IF NOT EXISTS idx_k22_p1_evidence_v22_work
  ON public.storyflow_evidence_packages_v22(work_id);

ALTER TABLE public.storyflow_evidence_packages_v22 ENABLE ROW LEVEL SECURITY;

-- Owner can read their own packages.
DROP POLICY IF EXISTS k22_p1_evidence_v22_owner_select ON public.storyflow_evidence_packages_v22;
CREATE POLICY k22_p1_evidence_v22_owner_select
  ON public.storyflow_evidence_packages_v22 FOR SELECT
  USING (owner_id = (select auth.uid()));

-- Owner can insert packages for their own works.
DROP POLICY IF EXISTS k22_p1_evidence_v22_owner_insert ON public.storyflow_evidence_packages_v22;
CREATE POLICY k22_p1_evidence_v22_owner_insert
  ON public.storyflow_evidence_packages_v22 FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

COMMENT ON TABLE public.storyflow_evidence_packages_v22 IS 'K22-P1 V2.2 evidence packages. Idempotent by manifest_hash. Legacy V1 packages remain in storyflow_evidence_packages.';

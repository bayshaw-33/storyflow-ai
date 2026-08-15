-- K22-P4 Task 4.2: Universe import — sessions, source works, immutable
-- source versions, files, chunks, candidates and decisions.
-- Forward-only, additive.
--
-- Builds on:
--   storyflow_works (K22-P0) — source works are works with work_type='source'
--   storyflow_universes (baseline) + storyflow_universe_versions (K22-P2)
--   storyflow_jobs / job events (baseline)
--
-- Storage: private bucket `universe-source-imports` with owner path policy.

-- ============================================================
-- storyflow_universe_import_sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_universe_import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  mode text NOT NULL CHECK (mode IN ('complete_screenplay','bible_triplet')),
  state text NOT NULL DEFAULT 'upload_draft' CHECK (state IN (
    'upload_draft','uploaded','extracting','review_required',
    'degraded','ready_for_u1','u1_ready','failed','cancelled'
  )),
  rights_declaration jsonb NOT NULL DEFAULT '{}'::jsonb,
  degraded_reason text,
  source_work_id uuid,
  universe_id uuid,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p4_import_sessions_owner
  ON public.storyflow_universe_import_sessions(owner_id, updated_at DESC);

ALTER TABLE public.storyflow_universe_import_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_import_sessions_owner ON public.storyflow_universe_import_sessions;
CREATE POLICY k22_p4_import_sessions_owner
  ON public.storyflow_universe_import_sessions
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

-- ============================================================
-- storyflow_source_works: read-only Source Work registry
-- (work_id → Phase 0 works row with work_type='source')
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_source_works (
  work_id uuid PRIMARY KEY REFERENCES public.storyflow_works(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL DEFAULT '',
  origin text NOT NULL DEFAULT 'external_upload',
  rights_state text NOT NULL DEFAULT 'private' CHECK (rights_state IN ('private','unclear','restricted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p4_source_works_owner
  ON public.storyflow_source_works(owner_id, created_at DESC);

ALTER TABLE public.storyflow_source_works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_source_works_owner ON public.storyflow_source_works;
CREATE POLICY k22_p4_source_works_owner
  ON public.storyflow_source_works
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

-- ============================================================
-- storyflow_source_versions: append-only immutable snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_source_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_work_id uuid NOT NULL REFERENCES public.storyflow_source_works(work_id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no >= 1),
  file_hashes text[] NOT NULL DEFAULT '{}',
  rights_declaration jsonb NOT NULL DEFAULT '{}'::jsonb,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_k22_p4_source_versions_no UNIQUE (source_work_id, version_no)
);

ALTER TABLE public.storyflow_source_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_source_versions_select ON public.storyflow_source_versions;
CREATE POLICY k22_p4_source_versions_select
  ON public.storyflow_source_versions FOR SELECT
  USING (source_work_id IN (SELECT sw.work_id FROM public.storyflow_source_works sw WHERE sw.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS k22_p4_source_versions_insert ON public.storyflow_source_versions;
CREATE POLICY k22_p4_source_versions_insert
  ON public.storyflow_source_versions FOR INSERT
  WITH CHECK (source_work_id IN (SELECT sw.work_id FROM public.storyflow_source_works sw WHERE sw.owner_id = (select auth.uid())));

CREATE OR REPLACE FUNCTION public.k22_p4_source_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'storyflow_source_versions is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_k22_p4_source_versions_immutable ON public.storyflow_source_versions;
CREATE TRIGGER trg_k22_p4_source_versions_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_source_versions
  FOR EACH ROW EXECUTE FUNCTION public.k22_p4_source_versions_immutable();

-- ============================================================
-- storyflow_universe_import_files
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_universe_import_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL CHECK (role IN ('screenplay','world_bible','character_bible','plot_outline','supplement')),
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
  content_hash text NOT NULL,
  object_key text NOT NULL,
  persisted boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p4_import_files_session
  ON public.storyflow_universe_import_files(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_k22_p4_import_files_hash
  ON public.storyflow_universe_import_files(session_id, content_hash);

ALTER TABLE public.storyflow_universe_import_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_import_files_owner ON public.storyflow_universe_import_files;
CREATE POLICY k22_p4_import_files_owner
  ON public.storyflow_universe_import_files
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

-- ============================================================
-- storyflow_source_chunks: extraction units with source offsets
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.storyflow_universe_import_files(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  page integer,
  overlap_before integer NOT NULL DEFAULT 0,
  overlap_after integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_k22_p4_source_chunks_key UNIQUE (file_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_k22_p4_source_chunks_session
  ON public.storyflow_source_chunks(session_id, chunk_index ASC);

ALTER TABLE public.storyflow_source_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_source_chunks_owner ON public.storyflow_source_chunks;
CREATE POLICY k22_p4_source_chunks_owner
  ON public.storyflow_source_chunks
  USING (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id))
  WITH CHECK (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id));

-- ============================================================
-- storyflow_universe_import_candidates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_universe_import_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('entity','fact','relationship','timeline_event','conflict')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence real NOT NULL DEFAULT 0.5,
  merged_from text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','merged','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p4_candidates_session
  ON public.storyflow_universe_import_candidates(session_id, kind, status);

ALTER TABLE public.storyflow_universe_import_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_candidates_owner ON public.storyflow_universe_import_candidates;
CREATE POLICY k22_p4_candidates_owner
  ON public.storyflow_universe_import_candidates
  USING (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id))
  WITH CHECK (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id));

-- ============================================================
-- storyflow_universe_import_decisions: append-only review trail
-- ============================================================

CREATE TABLE IF NOT EXISTS public.storyflow_universe_import_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.storyflow_universe_import_candidates(id),
  action text NOT NULL CHECK (action IN ('accept','reject','merge','edit','bulk_accept','undo')),
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by uuid NOT NULL REFERENCES auth.users(id),
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_k22_p4_decisions_session
  ON public.storyflow_universe_import_decisions(session_id, decided_at DESC);

ALTER TABLE public.storyflow_universe_import_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k22_p4_decisions_owner ON public.storyflow_universe_import_decisions;
CREATE POLICY k22_p4_decisions_owner
  ON public.storyflow_universe_import_decisions
  USING (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id))
  WITH CHECK (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id));

-- ============================================================
-- Private storage bucket + owner path policy
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('universe-source-imports', 'universe-source-imports', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS k22_p4_bucket_owner_read ON storage.objects;
CREATE POLICY k22_p4_bucket_owner_read
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'universe-source-imports'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS k22_p4_bucket_owner_write ON storage.objects;
CREATE POLICY k22_p4_bucket_owner_write
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'universe-source-imports'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

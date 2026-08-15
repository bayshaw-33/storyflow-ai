-- KIIKIS V2.2 Phase 6 — Staging 完整建立 P4 对象（UAT 复现修复）
-- Forward-only。不改 Phase 0–5 migration 文件。
-- Migration timestamp: 20260828060500（P6 release_fixes 与 fix_p4_policies 之间）
--
-- 背景：P4（20260828040000）在干净 DB 上因 owner policy 引用不存在的
-- owner_id 列（SQLSTATE 42703）而在单事务中整体回滚，P4 全部对象从未
-- 建立；P6 release_fixes（60000）因此失败。本 migration 在 staging 重建
-- P4 全部对象（定义与 P4 一致，owner policy 所需的 owner_id 列一并补齐，
-- 全部幂等），并补上 P6 的 5 个 append-only 触发器（60000 被 repair 跳过）。
--
-- 注意：本文件是 staging 恢复路径；P4 文件本身保持原样（forward-only 契约）。

-- ============================================================
-- 1. storyflow_universe_import_sessions
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
-- 2. storyflow_source_works
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
-- 3. storyflow_source_versions (append-only)
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
-- 4. storyflow_universe_import_files
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
-- 5. storyflow_source_chunks (+ owner_id 列，policy 前置)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.storyflow_universe_import_files(id) ON DELETE CASCADE,
  owner_id uuid,
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
-- 6. storyflow_universe_import_candidates (+ owner_id 列)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_universe_import_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  owner_id uuid,
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
-- 7. storyflow_universe_import_decisions (+ owner_id 列)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_universe_import_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.storyflow_universe_import_sessions(id) ON DELETE CASCADE,
  candidate_id uuid REFERENCES public.storyflow_universe_import_candidates(id),
  owner_id uuid,
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
-- 8. Private storage bucket + owner path policy
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

-- ============================================================
-- 9. P6 release_fixes 的 5 个 append-only 触发器（60000 被 repair 跳过）
-- ============================================================
CREATE OR REPLACE FUNCTION public.block_append_only_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% is append-only (no DELETE)', TG_TABLE_NAME;
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only (no UPDATE)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_k22_p6_snapshots_immutable ON public.storyflow_generation_request_snapshots;
CREATE TRIGGER trg_k22_p6_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_generation_request_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

DROP TRIGGER IF EXISTS trg_k22_p6_candidates_immutable ON public.storyflow_generation_candidates;
CREATE TRIGGER trg_k22_p6_candidates_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_generation_candidates
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

DROP TRIGGER IF EXISTS trg_k22_p6_evidence_immutable ON public.storyflow_evidence_events;
CREATE TRIGGER trg_k22_p6_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_evidence_events
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

DROP TRIGGER IF EXISTS trg_k22_p6_import_candidates_immutable ON public.storyflow_universe_import_candidates;
CREATE TRIGGER trg_k22_p6_import_candidates_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_universe_import_candidates
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

DROP TRIGGER IF EXISTS trg_k22_p6_import_decisions_immutable ON public.storyflow_universe_import_decisions;
CREATE TRIGGER trg_k22_p6_import_decisions_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_universe_import_decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

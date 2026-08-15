-- KIIKIS V2.2 Phase 6 — Fix P4 RLS policies (UAT staging 复现的发布阻断缺陷)
-- Forward-only。不修改 Phase 0–5 migration 文件；用新 migration 修复。
-- Migration timestamp: 20260828061000
--
-- 缺陷：P4（20260828040000）的 3 张表缺 owner_id 列，但 owner policy 引用它，
-- 导致 P4 在干净 DB 上执行失败（SQLSTATE 42703）：
--   storyflow_source_chunks / storyflow_universe_import_candidates /
--   storyflow_universe_import_decisions
-- 修复：补齐 owner_id 列（幂等）并重建 owner policy（DROP IF EXISTS 幂等）。

-- 1. storyflow_source_chunks
ALTER TABLE public.storyflow_source_chunks
  ADD COLUMN IF NOT EXISTS owner_id uuid;

DROP POLICY IF EXISTS k22_p4_source_chunks_owner ON public.storyflow_source_chunks;
CREATE POLICY k22_p4_source_chunks_owner
  ON public.storyflow_source_chunks
  USING (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id))
  WITH CHECK (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id));

-- 2. storyflow_universe_import_candidates
ALTER TABLE public.storyflow_universe_import_candidates
  ADD COLUMN IF NOT EXISTS owner_id uuid;

DROP POLICY IF EXISTS k22_p4_candidates_owner ON public.storyflow_universe_import_candidates;
CREATE POLICY k22_p4_candidates_owner
  ON public.storyflow_universe_import_candidates
  USING (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id))
  WITH CHECK (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id));

-- 3. storyflow_universe_import_decisions
ALTER TABLE public.storyflow_universe_import_decisions
  ADD COLUMN IF NOT EXISTS owner_id uuid;

DROP POLICY IF EXISTS k22_p4_decisions_owner ON public.storyflow_universe_import_decisions;
CREATE POLICY k22_p4_decisions_owner
  ON public.storyflow_universe_import_decisions
  USING (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id))
  WITH CHECK (owner_id = (SELECT s.owner_id FROM public.storyflow_universe_import_sessions s WHERE s.id = session_id));

COMMENT ON COLUMN public.storyflow_source_chunks.owner_id IS
  'P6 fix: P4 owner policy 引用列补齐（服务层写入时填充）';
COMMENT ON COLUMN public.storyflow_universe_import_candidates.owner_id IS
  'P6 fix: P4 owner policy 引用列补齐（服务层写入时填充）';
COMMENT ON COLUMN public.storyflow_universe_import_decisions.owner_id IS
  'P6 fix: P4 owner policy 引用列补齐（服务层写入时填充）';

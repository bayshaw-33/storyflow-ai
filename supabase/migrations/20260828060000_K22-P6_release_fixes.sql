-- KIIKIS V2.2 Phase 6 — Release fixes (UAT 发现的发布阻断 schema 缺陷)
-- Forward-only。不修改 Phase 0–5 migration；仅补齐已复现的 append-only 保护。
-- Migration timestamp: 20260828060000 (continues P5 20260828050000)
--
-- 缺陷（audit-kiikis-22-migrations 复现）：
--   P1 generation_request_snapshots / generation_candidates
--   P3 evidence_events
--   P4 universe_import_candidates / universe_import_decisions
-- 均缺 UPDATE/DELETE 拦截触发器 —— 普通用户可改写/删除只应 append-only 的记录。

-- 通用 append-only 拦截函数（复用 P1/P4 已有的同名函数，若不存在则创建）
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

-- 1. P1: generation_request_snapshots
DROP TRIGGER IF EXISTS trg_k22_p6_snapshots_immutable ON public.storyflow_generation_request_snapshots;
CREATE TRIGGER trg_k22_p6_snapshots_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_generation_request_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

-- 2. P1: generation_candidates
DROP TRIGGER IF EXISTS trg_k22_p6_candidates_immutable ON public.storyflow_generation_candidates;
CREATE TRIGGER trg_k22_p6_candidates_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_generation_candidates
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

-- 3. P3: evidence_events
DROP TRIGGER IF EXISTS trg_k22_p6_evidence_immutable ON public.storyflow_evidence_events;
CREATE TRIGGER trg_k22_p6_evidence_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_evidence_events
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

-- 4. P4: universe_import_candidates
DROP TRIGGER IF EXISTS trg_k22_p6_import_candidates_immutable ON public.storyflow_universe_import_candidates;
CREATE TRIGGER trg_k22_p6_import_candidates_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_universe_import_candidates
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

-- 5. P4: universe_import_decisions
DROP TRIGGER IF EXISTS trg_k22_p6_import_decisions_immutable ON public.storyflow_universe_import_decisions;
CREATE TRIGGER trg_k22_p6_import_decisions_immutable
  BEFORE UPDATE OR DELETE ON public.storyflow_universe_import_decisions
  FOR EACH ROW EXECUTE FUNCTION public.block_append_only_mutation();

COMMENT ON FUNCTION public.block_append_only_mutation() IS
  'P6: 统一 append-only 拦截；candidates/snapshots/decisions/events 等只允许 INSERT';

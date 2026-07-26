-- ============================================================
-- TRAE-V2-04 Follow-up: scenes.locked 列与索引治理
-- 日期: 2026-08-26
-- 背景:
--   d70e9b1 修改了既有迁移 20260826000001_director_meta.sql，
--   为 scenes 表补 locked 列、把索引从 JSONB 键路径改为独立列。
--   该修改违反"迁移不可变"治理原则：
--   已执行旧版 20260826000001 的环境不会重新执行修改后的文件，
--   导致这些环境持续缺少 scenes.locked 列、索引与查询代码不匹配。
-- 目标:
--   通过独立的 follow-up migration 把所有环境收敛到一致状态。
-- 幂等:
--   全部操作使用 IF NOT EXISTS / IF EXISTS，可安全重复执行。
--   - 新环境（执行新版 20260826000001）：本 follow-up 为 no-op
--   - 旧环境（执行旧版 20260826000001）：本 follow-up 补齐 locked 列与索引
-- ============================================================

BEGIN;

-- 1. 为 scenes 表补 locked 列（旧版 20260826000001 遗漏）
--    shots 表的 locked 列在 20260717152816 中已添加，无需重复
ALTER TABLE public.storyflow_production_scenes
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.storyflow_production_scenes.locked IS
  'TRAE-V2-04 Scene 锁定标记：锁定后不被重新分析覆盖';

-- 2. 删除旧索引（旧版使用 JSONB 键路径作为 WHERE 谓词）
--    新版索引定义使用独立 locked 列作为 WHERE 谓词
--    索引名相同，必须先 DROP 才能用新定义重建
DROP INDEX IF EXISTS public.idx_production_scenes_director_locked;
DROP INDEX IF EXISTS public.idx_production_shots_director_locked;

-- 3. 重建索引（使用独立 locked 列，与 V2-04/V2-07 查询代码匹配）
CREATE INDEX IF NOT EXISTS idx_production_scenes_director_locked
  ON public.storyflow_production_scenes (production_project_id, deleted_at)
  WHERE locked = true;

CREATE INDEX IF NOT EXISTS idx_production_shots_director_locked
  ON public.storyflow_production_shots (production_project_id, deleted_at)
  WHERE locked = true;

COMMIT;

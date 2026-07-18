-- ============================================================
-- 20260720020000_production_shots_prop_refs.sql
-- PRD v3.0 §6.4 关键道具：作品详情需展示 prop 缩略图
-- 当前 storyflow_production_shots 只有 character_refs/scene_refs，缺 prop_refs
-- 幂等添加 prop_refs JSONB 列，默认空数组
-- ============================================================

BEGIN;

ALTER TABLE public.storyflow_production_shots
  ADD COLUMN IF NOT EXISTS prop_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.storyflow_production_shots.prop_refs IS
  'PRD v3.0 §6.4: 镜头关联的关键道具名/ID 数组，用于作品详情聚合 prop 缩略图。';

COMMIT;

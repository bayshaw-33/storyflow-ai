-- ============================================================
-- TRAE-V2-04: AI Director + Scene/Shot Breakdown
-- 为 scene/shot 表添加 director_meta JSONB 字段，承载 AI Director 维度数据
-- 同时为 scenes 表补 locked 列（shots 表已在 20260717152816 中添加）
-- 不破坏现有 Contract，不修改现有列
-- ============================================================

-- 1. Scene 表添加 director_meta 和 locked 列
ALTER TABLE public.storyflow_production_scenes
  ADD COLUMN IF NOT EXISTS director_meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.storyflow_production_scenes.director_meta IS
  'TRAE-V2-04 AI Director 维度数据：scene_function, conflict, emotion, value_shift, blocking, scene_assets, source_quote_range';

COMMENT ON COLUMN public.storyflow_production_scenes.locked IS
  'TRAE-V2-04 Scene 锁定标记：锁定后不被重新分析覆盖';

-- 2. Shot 表添加 director_meta（locked 列已在 20260717152816 中添加）
ALTER TABLE public.storyflow_production_shots
  ADD COLUMN IF NOT EXISTS director_meta JSONB DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN public.storyflow_production_shots.director_meta IS
  'TRAE-V2-04 AI Director 维度数据：focal_length, blocking, camera_start, movement_path, speed_curve, parallax, focus_change, end_frame, transition_interface, lighting, color, sound_effects, provider_params';

-- 3. 索引（便于按 locked 筛选，使用独立列而非 JSONB 键）
CREATE INDEX IF NOT EXISTS idx_production_scenes_director_locked
  ON public.storyflow_production_scenes (production_project_id, deleted_at)
  WHERE locked = true;

CREATE INDEX IF NOT EXISTS idx_production_shots_director_locked
  ON public.storyflow_production_shots (production_project_id, deleted_at)
  WHERE locked = true;

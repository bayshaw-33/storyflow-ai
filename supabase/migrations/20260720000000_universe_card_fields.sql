-- ============================================================
-- 20260720000000_universe_card_fields.sql
-- PRD v3.0 §8.2 + §8.3
-- 为 Universe 卡片摘要/封面/归档 + Entity 主图字段建幂等 migration
-- 说明：description 保留完整 Universe Bible，不再用于列表展示
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. storyflow_universes 卡片字段
-- ------------------------------------------------------------

ALTER TABLE public.storyflow_universes
  ADD COLUMN IF NOT EXISTS card_summary text NOT NULL DEFAULT '';

ALTER TABLE public.storyflow_universes
  ADD COLUMN IF NOT EXISTS cover_asset_version_id uuid NULL;

ALTER TABLE public.storyflow_universes
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

COMMENT ON COLUMN public.storyflow_universes.card_summary IS
  'PRD v3.0: 列表卡片短摘要，中文最多 60 字，英文最多 160 字。description 保留完整 Bible。';

COMMENT ON COLUMN public.storyflow_universes.cover_asset_version_id IS
  'PRD v3.0: 卡片封面引用的持久化 asset version id。服务端写入时校验 owner + version 状态。暂不建 FK。';

COMMENT ON COLUMN public.storyflow_universes.archived_at IS
  'PRD v3.0: 归档时间戳。非 NULL 表示已归档，列表默认排除。可恢复，不物理删除。';

CREATE INDEX IF NOT EXISTS idx_storyflow_universes_active
  ON public.storyflow_universes (updated_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_storyflow_universes_owner_active
  ON public.storyflow_universes (user_id, updated_at DESC)
  WHERE archived_at IS NULL;

-- ------------------------------------------------------------
-- 2. storyflow_universe_entities 主图字段
-- ------------------------------------------------------------

ALTER TABLE public.storyflow_universe_entities
  ADD COLUMN IF NOT EXISTS primary_asset_version_id uuid NULL;

COMMENT ON COLUMN public.storyflow_universe_entities.primary_asset_version_id IS
  'PRD v3.0 §8.3: Entity 主图引用的持久化 asset version id。写入时校验 entity 归属、version owner/team 一致、状态 completed/approved、已转存 Storage。';

CREATE INDEX IF NOT EXISTS idx_storyflow_universe_entities_universe_type
  ON public.storyflow_universe_entities (universe_id, type, updated_at DESC);

COMMIT;

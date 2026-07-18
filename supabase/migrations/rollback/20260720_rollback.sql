-- ============================================================
-- 20260720_rollback.sql
-- 回滚 20260720000000 + 20260720010000 两个 migration
-- 警告：
--   1. 回滚不删除用户创作数据（owner_id/team_id 回填值保留）
--   2. 仅回退结构变更（drop columns / restore open policies）
--   3. 执行前必须先备份
--   4. 生产执行需 DBA 签署
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 回滚 20260720010000: casting/portrayal
-- ------------------------------------------------------------

-- 删除新建的 owner/team 策略
DROP POLICY IF EXISTS casting_assignments_select ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS casting_assignments_insert ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS casting_assignments_update ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS casting_assignments_delete ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS portrayals_select ON public.storyflow_character_portrayals;
DROP POLICY IF EXISTS portrayals_insert ON public.storyflow_character_portrayals;
DROP POLICY IF EXISTS portrayals_update ON public.storyflow_character_portrayals;
DROP POLICY IF EXISTS portrayals_delete ON public.storyflow_character_portrayals;

-- 恢复开放策略（仅用于紧急回滚，不作为长期方案）
CREATE POLICY casting_assignments_select ON public.storyflow_casting_assignments FOR SELECT USING (true);
CREATE POLICY casting_assignments_insert ON public.storyflow_casting_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY casting_assignments_update ON public.storyflow_casting_assignments FOR UPDATE USING (true);
CREATE POLICY casting_assignments_delete ON public.storyflow_casting_assignments FOR DELETE USING (true);
CREATE POLICY portrayals_select ON public.storyflow_character_portrayals FOR SELECT USING (true);
CREATE POLICY portrayals_insert ON public.storyflow_character_portrayals FOR INSERT WITH CHECK (true);
CREATE POLICY portrayals_update ON public.storyflow_character_portrayals FOR UPDATE USING (true);
CREATE POLICY portrayals_delete ON public.storyflow_character_portrayals FOR DELETE USING (true);

-- 删除索引
DROP INDEX IF EXISTS public.idx_casting_assignments_owner;
DROP INDEX IF EXISTS public.idx_casting_assignments_team;
DROP INDEX IF EXISTS public.idx_portrayals_owner;
DROP INDEX IF EXISTS public.idx_portrayals_team;
DROP INDEX IF EXISTS public.idx_portrayals_actor_owner;

-- 注意：owner_id/team_id 列保留（已回填的用户数据不删除），仅移除策略保护
-- 如需彻底回退列结构，取消下方注释（会丢失回填的 owner_id 数据）
-- ALTER TABLE public.storyflow_casting_assignments DROP COLUMN IF EXISTS owner_id, DROP COLUMN IF EXISTS team_id;
-- ALTER TABLE public.storyflow_character_portrayals DROP COLUMN IF EXISTS owner_id, DROP COLUMN IF EXISTS team_id;

-- ------------------------------------------------------------
-- 回滚 20260720000000: universe 卡片字段
-- ------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_storyflow_universes_active;
DROP INDEX IF EXISTS public.idx_storyflow_universes_owner_active;
DROP INDEX IF EXISTS public.idx_storyflow_universe_entities_universe_type;

ALTER TABLE public.storyflow_universes
  DROP COLUMN IF EXISTS card_summary,
  DROP COLUMN IF EXISTS cover_asset_version_id,
  DROP COLUMN IF EXISTS archived_at;

ALTER TABLE public.storyflow_universe_entities
  DROP COLUMN IF EXISTS primary_asset_version_id;

COMMIT;

-- ============================================================
-- 20260720_rollback.sql
-- 20260720000000 + 20260720010000 安全回退脚本
-- 警告：
--   1. 回退不删除用户创作数据或新增列
--   2. 团队权限异常时收窄为 owner-only，绝不恢复开放策略
--   3. 执行前必须先备份
--   4. 修复后可重放原 migration 恢复团队协作权限
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

-- 安全降级为 owner-only。团队成员会暂时失去访问，但数据不会越权暴露。
CREATE POLICY casting_assignments_select ON public.storyflow_casting_assignments
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY casting_assignments_insert ON public.storyflow_casting_assignments
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY casting_assignments_update ON public.storyflow_casting_assignments
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY casting_assignments_delete ON public.storyflow_casting_assignments
  FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY portrayals_select ON public.storyflow_character_portrayals
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY portrayals_insert ON public.storyflow_character_portrayals
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY portrayals_update ON public.storyflow_character_portrayals
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY portrayals_delete ON public.storyflow_character_portrayals
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Universe 卡片与实体主图字段是纯增量 nullable/default 字段，保留它们是最安全的
-- 回退策略；删除字段会丢失用户已经选择的摘要、封面、归档和主图数据。

COMMIT;

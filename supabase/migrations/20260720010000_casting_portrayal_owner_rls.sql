-- ============================================================
-- 20260720010000_casting_portrayal_owner_rls.sql
-- PRD v3.0 §8.4
-- 为 casting_assignments / character_portrayals 补充 owner_id + team_id，
-- 回填历史数据，删除 USING(true)/WITH CHECK(true) 开放策略，
-- 改为 owner / active team role 控制。
-- 依赖：is_team_member(uuid, uuid, text[]) 已在 20260716193000 定义
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 加列
-- ------------------------------------------------------------

ALTER TABLE public.storyflow_casting_assignments
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid NULL;

ALTER TABLE public.storyflow_character_portrayals
  ADD COLUMN IF NOT EXISTS owner_id uuid NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid NULL;

-- ------------------------------------------------------------
-- 2. 回填 owner_id
--    casting: 从 storyflow_projects.owner_id 回填（project_id 关联）
--    portrayal: 从 storyflow_actor_profiles.owner_id 回填（actor_profile_id 关联）
--    无法确认 owner 的行保留 NULL，由 §A.4 审计脚本输出清单
-- ------------------------------------------------------------

UPDATE public.storyflow_casting_assignments ca
  SET owner_id = sub.owner_id
  FROM (
    SELECT p.id AS project_id, p.owner_id
    FROM public.storyflow_projects p
    WHERE p.owner_id IS NOT NULL
  ) sub
  WHERE ca.project_id = sub.project_id
    AND ca.owner_id IS NULL;

UPDATE public.storyflow_character_portrayals cp
  SET owner_id = ap.owner_id
  FROM public.storyflow_actor_profiles ap
  WHERE cp.actor_profile_id = ap.id
    AND ap.owner_id IS NOT NULL
    AND cp.owner_id IS NULL;

-- team_id 回填：优先从 actor_profile.team_id，其次从 project 关联的 universe.team_id
UPDATE public.storyflow_character_portrayals cp
  SET team_id = ap.team_id
  FROM public.storyflow_actor_profiles ap
  WHERE cp.actor_profile_id = ap.id
    AND ap.team_id IS NOT NULL
    AND cp.team_id IS NULL;

UPDATE public.storyflow_casting_assignments ca
  SET team_id = u.team_id
  FROM public.storyflow_universe_project_links l
  JOIN public.storyflow_universes u ON u.id = l.universe_id
  WHERE l.project_id = ca.project_id
    AND u.team_id IS NOT NULL
    AND ca.team_id IS NULL;

-- ------------------------------------------------------------
-- 3. 审计：输出无法回填 owner 的行（不阻塞迁移）
--    执行后在 psql 客户端查看 NOTICE
-- ------------------------------------------------------------

DO $$
DECLARE
  orphan_casting int;
  orphan_portrayal int;
BEGIN
  SELECT COUNT(*) INTO orphan_casting
    FROM public.storyflow_casting_assignments WHERE owner_id IS NULL;
  SELECT COUNT(*) INTO orphan_portrayal
    FROM public.storyflow_character_portrayals WHERE owner_id IS NULL;
  RAISE NOTICE ' casting_assignments with NULL owner_id (audit required): %', orphan_casting;
  RAISE NOTICE ' character_portrayals with NULL owner_id (audit required): %', orphan_portrayal;
  IF orphan_casting > 0 OR orphan_portrayal > 0 THEN
    RAISE NOTICE ' PRD §8.4: 无法确认 owner 的历史行已保留 NULL，请用 audit-casting-portrayal-orphans.sql 输出清单人工处理。不猜测归属。';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. 索引
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_casting_assignments_owner
  ON public.storyflow_casting_assignments (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_casting_assignments_team
  ON public.storyflow_casting_assignments (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portrayals_owner
  ON public.storyflow_character_portrayals (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_portrayals_team
  ON public.storyflow_character_portrayals (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portrayals_actor_owner
  ON public.storyflow_character_portrayals (actor_profile_id, owner_id);

-- ------------------------------------------------------------
-- 5. 删除开放 RLS 策略（USING true / WITH CHECK true）
-- ------------------------------------------------------------

DROP POLICY IF EXISTS casting_assignments_select ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS casting_assignments_insert ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS casting_assignments_update ON public.storyflow_casting_assignments;
DROP POLICY IF EXISTS casting_assignments_delete ON public.storyflow_casting_assignments;

DROP POLICY IF EXISTS portrayals_select ON public.storyflow_character_portrayals;
DROP POLICY IF EXISTS portrayals_insert ON public.storyflow_character_portrayals;
DROP POLICY IF EXISTS portrayals_update ON public.storyflow_character_portrayals;
DROP POLICY IF EXISTS portrayals_delete ON public.storyflow_character_portrayals;

-- ------------------------------------------------------------
-- 6. 新建 owner / team role 策略
--    owner_id = auth.uid()  OR  is_team_member(team_id, auth.uid(), {owner,admin,editor,viewer})
--    SELECT: owner + 任意 active team member
--    INSERT/UPDATE/DELETE: owner + owner/admin/editor（viewer 只读）
--    owner_id 缺失（NULL）的旧行：仅 service role 可见，前端通过服务端聚合读取
-- ------------------------------------------------------------

CREATE POLICY casting_assignments_select ON public.storyflow_casting_assignments
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor','viewer']))
  );

CREATE POLICY casting_assignments_insert ON public.storyflow_casting_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  );

CREATE POLICY casting_assignments_update ON public.storyflow_casting_assignments
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  );

CREATE POLICY casting_assignments_delete ON public.storyflow_casting_assignments
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  );

CREATE POLICY portrayals_select ON public.storyflow_character_portrayals
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor','viewer']))
  );

CREATE POLICY portrayals_insert ON public.storyflow_character_portrayals
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  );

CREATE POLICY portrayals_update ON public.storyflow_character_portrayals
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  );

CREATE POLICY portrayals_delete ON public.storyflow_character_portrayals
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner','admin','editor']))
  );

COMMIT;

-- 验证语句
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname='public'
--   AND tablename IN ('storyflow_casting_assignments','storyflow_character_portrayals')
-- ORDER BY tablename, policyname;
-- 期望：8 条策略，全部带 owner_id = auth.uid() OR is_team_member(...)，无 USING(true)

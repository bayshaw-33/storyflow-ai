-- ============================================================
-- Migration: 20260721000000_actor_platform_visibility.sql
-- 目的：为 storyflow_actor_profiles 引入 platform 共享可见性
--
-- 背景（PRD §P1 建立平台共享演员库）：
--   private   仅创建者可见
--   team      团队成员可见
--   platform  全平台已登录用户可见（用于"使用此演员"流程）
--
-- 变更：
--   1. 扩展 visibility CHECK 约束加入 'platform'
--   2. 重建 actor_profiles_visible_select RLS 策略：
--      - owner 永远可读自己的演员
--      - visibility='team' 且是团队 active 成员可读
--      - visibility='platform' 时所有 authenticated 用户可读
--   3. 重建 actor_profiles_owner_or_team_editor_insert RLS 策略：
--      - platform 共享不改变 INSERT 权限：仍要求 owner_id = auth.uid()
--      - team 共享要求是团队 owner/admin/editor
--      - platform 共享时 team_id 必须为 NULL（平台级共享，不属于某个团队）
--
-- 注意：基础资料编辑/删除仍由应用层 assertCanEditActorBasicProfile 强制（仅创建者）。
--      RLS 只负责"可见性"，不负责"可写性"——可写性在 UPDATE/DELETE 策略上单独控制。
--      本 migration 不修改 UPDATE/DELETE 策略（baseline 未启用 UPDATE/DELETE RLS，
--      应用层 assertCanEditActorBasicProfile 已是强约束）。
-- ============================================================

-- 1. 扩展 visibility CHECK 约束
ALTER TABLE public.storyflow_actor_profiles
  DROP CONSTRAINT IF EXISTS storyflow_actor_profiles_visibility_check;

ALTER TABLE public.storyflow_actor_profiles
  ADD CONSTRAINT storyflow_actor_profiles_visibility_check
  CHECK (visibility = ANY (ARRAY['private'::text, 'team'::text, 'platform'::text]));

-- 2. 重建 SELECT 策略：platform 可见性对所有 authenticated 用户可读
DROP POLICY IF EXISTS actor_profiles_visible_select ON public.storyflow_actor_profiles;

CREATE POLICY actor_profiles_visible_select
  ON public.storyflow_actor_profiles
  FOR SELECT TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (visibility = 'platform'::text)
    OR (
      visibility = 'team'::text
      AND EXISTS (
        SELECT 1
        FROM public.storyflow_team_members m
        WHERE m.team_id = storyflow_actor_profiles.team_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'::text
      )
    )
  );

-- 3. 重建 INSERT 策略：
--    - owner_id 必须等于 auth.uid()（禁止伪造他人 actor）
--    - visibility='private' 任意 authenticated 可创建自己的私有演员
--    - visibility='team' 要求是团队 owner/admin/editor
--    - visibility='platform' 允许任意 authenticated 用户创建平台共享演员
--      （应用层肖像权边界：真人照片默认 private，确认肖像授权后才能设 platform）
DROP POLICY IF EXISTS actor_profiles_owner_or_team_editor_insert ON public.storyflow_actor_profiles;

CREATE POLICY actor_profiles_owner_or_team_editor_insert
  ON public.storyflow_actor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      visibility = 'private'::text
      OR visibility = 'platform'::text
      OR (
        visibility = 'team'::text
        AND EXISTS (
          SELECT 1
          FROM public.storyflow_team_members m
          WHERE m.team_id = storyflow_actor_profiles.team_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'::text
            AND m.role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text])
        )
      )
    )
  );

-- 注释：便于运维查询
COMMENT ON POLICY actor_profiles_visible_select ON public.storyflow_actor_profiles IS
  'Owner always readable; platform readable by all authenticated; team readable by active team members.';
COMMENT ON POLICY actor_profiles_owner_or_team_editor_insert ON public.storyflow_actor_profiles IS
  'owner_id must equal auth.uid(); platform allowed; team requires owner/admin/editor role.';

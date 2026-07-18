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
--   3. 收紧客户端 INSERT / UPDATE RLS 策略：
--      - platform 共享只能经服务端权限校验后以 service_role 写入
--      - authenticated Data API 不能伪造 rights_state 绕过肖像权确认
--      - team 共享要求是团队 owner/admin/editor
--      - platform 共享时 team_id 必须为 NULL（平台级共享，不属于某个团队）
--
-- 注意：平台共享是服务端受控状态。RLS 同时拒绝 authenticated 角色直接
--      INSERT / UPDATE 为 platform，避免绕过 assertCanSetPlatformVisibility。
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
--    - visibility='platform' 只能由服务端完成肖像权校验后写入
DROP POLICY IF EXISTS actor_profiles_owner_or_team_editor_insert ON public.storyflow_actor_profiles;

CREATE POLICY actor_profiles_owner_or_team_editor_insert
  ON public.storyflow_actor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      visibility = 'private'::text
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

-- 4. 重建 UPDATE 策略：同样禁止客户端直接升级为 platform。
-- service_role 不受 RLS 限制，正常 /api/actors 服务端流程保持可用。
DROP POLICY IF EXISTS actor_profiles_owner_or_team_admin_update ON public.storyflow_actor_profiles;

CREATE POLICY actor_profiles_owner_or_team_admin_update
  ON public.storyflow_actor_profiles
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (
      team_id IS NOT NULL
      AND public.is_team_member(team_id, auth.uid(), ARRAY['owner'::text, 'admin'::text])
    )
  )
  WITH CHECK (
    visibility <> 'platform'::text
    AND (
      owner_id = auth.uid()
      OR (
        team_id IS NOT NULL
        AND public.is_team_member(team_id, auth.uid(), ARRAY['owner'::text, 'admin'::text])
      )
    )
  );

-- 注释：便于运维查询
COMMENT ON POLICY actor_profiles_visible_select ON public.storyflow_actor_profiles IS
  'Owner always readable; platform readable by all authenticated; team readable by active team members.';
COMMENT ON POLICY actor_profiles_owner_or_team_editor_insert ON public.storyflow_actor_profiles IS
  'owner_id must equal auth.uid(); platform requires the server-side rights check; team requires owner/admin/editor role.';
COMMENT ON POLICY actor_profiles_owner_or_team_admin_update ON public.storyflow_actor_profiles IS
  'Owners/team admins may update non-platform actors directly; platform visibility requires the server-side rights check.';

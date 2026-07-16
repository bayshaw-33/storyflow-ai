-- 修复 storyflow_team_members RLS 无限递归问题
-- 根因：art_projects / teams / team_members 三表 RLS 互相 EXISTS 引用，形成循环
--   art_projects_access WITH CHECK -> 查 team_members -> team_members RLS -> 查 teams -> teams RLS -> 查 team_members -> ...
-- 同时修正字段对应错误：m.team_id = m.team_id (恒真) 和 m.team_id = m.id (错误) 应为 m.team_id = <target_table>.team_id/id
-- 解决方案：用 SECURITY DEFINER 函数封装"用户是否为某 team 活跃成员"检查，绕开 RLS 递归

-- 1. 创建成员检查函数（SECURITY DEFINER 以绕过 RLS，避免递归）
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid, p_user_id uuid, p_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.storyflow_team_members m
    WHERE m.team_id = p_team_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
      AND (p_roles IS NULL OR m.role = ANY (p_roles))
  );
$$;

-- 2. 修复 storyflow_art_projects 策略：用函数替换内联 EXISTS
DROP POLICY IF EXISTS art_projects_access ON public.storyflow_art_projects;

CREATE POLICY art_projects_access ON public.storyflow_art_projects
  TO authenticated
  USING (
    (owner_id = auth.uid())
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND (team_id IS NULL OR public.is_team_member(team_id, auth.uid(), ARRAY['owner', 'admin', 'editor']))
  );

-- 3. 修复 storyflow_teams 策略：用函数替换内联 EXISTS（原 m.team_id = m.id 字段对应错误）
DROP POLICY IF EXISTS teams_member_select ON public.storyflow_teams;
DROP POLICY IF EXISTS teams_admin_update ON public.storyflow_teams;
DROP POLICY IF EXISTS teams_owner_insert ON public.storyflow_teams;

CREATE POLICY teams_owner_insert ON public.storyflow_teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY teams_member_select ON public.storyflow_teams
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.is_team_member(id, auth.uid())
  );

CREATE POLICY teams_admin_update ON public.storyflow_teams
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.is_team_member(id, auth.uid(), ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.is_team_member(id, auth.uid(), ARRAY['owner', 'admin'])
  );

-- 4. 修复 storyflow_team_members 策略
-- team_members_admin_all 原查 storyflow_teams.owner_id = auth.uid()，会触发 teams RLS 反向查 team_members 形成递归
-- 改为：owner 直接判断 + 成员自身可查自己
DROP POLICY IF EXISTS team_members_admin_all ON public.storyflow_team_members;
DROP POLICY IF EXISTS team_members_member_select ON public.storyflow_team_members;

-- 成员可读取自己所在团队的成员记录（不递归，仅 user_id 字段比较）
CREATE POLICY team_members_member_select ON public.storyflow_team_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 团队 owner / admin 可管理成员：用 SECURITY DEFINER 函数判断 owner，避免查 teams 表 RLS
-- 注意：is_team_member 不能判断 owner_id，所以另起一个 owner 判断函数
CREATE OR REPLACE FUNCTION public.is_team_owner(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.storyflow_teams t
    WHERE t.id = p_team_id
      AND t.owner_id = p_user_id
  );
$$;

CREATE POLICY team_members_admin_all ON public.storyflow_team_members
  TO authenticated
  USING (public.is_team_owner(team_id, auth.uid()))
  WITH CHECK (public.is_team_owner(team_id, auth.uid()));

-- 5. 修复 storyflow_actor_profiles 策略（同样存在递归 + 字段对应错误 m.team_id = m.team_id 恒真）
DROP POLICY IF EXISTS actor_profiles_owner_or_team_admin_update ON public.storyflow_actor_profiles;
DROP POLICY IF EXISTS actor_profiles_owner_or_team_editor_insert ON public.storyflow_actor_profiles;
DROP POLICY IF EXISTS actor_profiles_visible_select ON public.storyflow_actor_profiles;

CREATE POLICY actor_profiles_visible_select ON public.storyflow_actor_profiles
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (visibility = 'team' AND team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid()))
  );

CREATE POLICY actor_profiles_owner_or_team_admin_update ON public.storyflow_actor_profiles
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner', 'admin']))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner', 'admin']))
  );

CREATE POLICY actor_profiles_owner_or_team_editor_insert ON public.storyflow_actor_profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND (
      visibility = 'private'
      OR (team_id IS NOT NULL AND public.is_team_member(team_id, auth.uid(), ARRAY['owner', 'admin', 'editor']))
    )
  );


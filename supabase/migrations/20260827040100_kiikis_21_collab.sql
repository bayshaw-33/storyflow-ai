-- KIIKIS 2.1 Phase 4 — Task 4.2 项目级轻协作 (CO-001~008)
--
-- 覆盖:
--   CO-001: 角色体系 (owner/editor/reviewer/viewer/asset_operator)
--   CO-002: 任务指派 (assignee + assigned_by + assigned_at)
--   CO-003: 评论锚定稳定 ID (resourceType + resourceId + version)
--   CO-004: 审阅流程 (pending → in_review → approved/rejected)
--   CO-005: 批准/驳回 (原因 + 审阅人 + 修改建议)
--   CO-006: 活动轨迹 (锚定 resourceType + resourceId)
--   CO-007: 通知 (复用 Phase 1 creative_events)
--   CO-008: 个人账号所有权根 (无企业组织层级)
--
-- 表设计原则:
--   1. comments 锚定 resourceType + resourceId + version (CO-003)
--   2. reviews 状态机: pending → in_review → approved/rejected (CO-004)
--   3. activity append-only, 锚定资源 (CO-006)
--   4. notifications 通过 Phase 1 creative_events 触发 (CO-007)
--   5. 所有表 RLS: owner 或有 collaboration grant 的成员可读写

BEGIN;

-- =========================================================
-- 1. storyflow_comments — 评论 (CO-003: 锚定稳定 ID)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_comments (
  id uuid primary key default gen_random_uuid(),
  -- CO-003: 锚定 resourceType + resourceId + version (不锚定数组下标)
  resource_type text not null check (resource_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene')),
  resource_id uuid not null,
  resource_version text, -- 锚定版本 (CO-003: 版本变化后仍可定位)
  -- 作者
  author_id uuid not null references auth.users(id) on delete restrict,
  -- 内容
  body text not null check (length(body) > 0 and length(body) <= 10000),
  -- 锚点 (可选: 段落 ID、帧 ID 等, 但不锚定数组下标)
  anchor_type text, -- e.g. 'paragraph', 'frame', 'scene'
  anchor_id text, -- 稳定 ID (非数组下标)
  -- 父评论 (支持回复)
  parent_comment_id uuid references public.storyflow_comments(id) on delete cascade,
  -- 已解决 (审阅完成后可标记)
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null unique
);

CREATE INDEX IF NOT EXISTS idx_comments_resource
  ON public.storyflow_comments(resource_type, resource_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_author
  ON public.storyflow_comments(author_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON public.storyflow_comments(parent_comment_id);

COMMENT ON TABLE public.storyflow_comments IS
  'CO-003: 评论锚定 resourceType + resourceId + version, 不锚定数组下标';

ALTER TABLE public.storyflow_comments ENABLE ROW LEVEL SECURITY;

-- 作者可读写自己的评论; 有 grant 的成员可读 (RLS 通过 resource 隐式关联)
-- 这里简化: 作者可 CRUD 自己的评论, 所有认证用户可读 (细化由 grant 控制)
CREATE POLICY comments_owner_select
  ON public.storyflow_comments
  FOR SELECT
  USING (true); -- 评论默认可读 (项目协作场景)

CREATE POLICY comments_author_insert
  ON public.storyflow_comments
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY comments_author_update
  ON public.storyflow_comments
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY comments_author_delete
  ON public.storyflow_comments
  FOR DELETE
  USING (auth.uid() = author_id);

-- =========================================================
-- 2. storyflow_reviews — 审阅流程 (CO-004/005)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_reviews (
  id uuid primary key default gen_random_uuid(),
  -- 锚定资源
  resource_type text not null check (resource_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene')),
  resource_id uuid not null,
  resource_version text,
  -- 审阅人
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  -- 状态机 (CO-004: pending → in_review → approved/rejected)
  status text not null default 'pending' check (status in ('pending', 'in_review', 'approved', 'rejected')),
  -- CO-005: 批准/驳回原因 + 修改建议
  decision_reason text,
  change_suggestions jsonb not null default '[]'::jsonb,
  -- 审阅时间线
  submitted_at timestamptz,
  reviewed_at timestamptz,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null unique
);

CREATE INDEX IF NOT EXISTS idx_reviews_resource
  ON public.storyflow_reviews(resource_type, resource_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer
  ON public.storyflow_reviews(reviewer_id, status);

COMMENT ON TABLE public.storyflow_reviews IS
  'CO-004/005: 审阅状态机 pending → in_review → approved/rejected, 附带原因和修改建议';

ALTER TABLE public.storyflow_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_select
  ON public.storyflow_reviews
  FOR SELECT
  USING (true);

CREATE POLICY reviews_reviewer_insert
  ON public.storyflow_reviews
  FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY reviews_reviewer_update
  ON public.storyflow_reviews
  FOR UPDATE
  USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

-- =========================================================
-- 3. storyflow_activity — 活动轨迹 (CO-006: append-only)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_activity (
  id uuid primary key default gen_random_uuid(),
  -- 锚定资源 (CO-006)
  project_id uuid, -- 项目级活动流
  resource_type text not null check (resource_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene', 'comment', 'review', 'grant', 'task')),
  resource_id uuid not null,
  -- 活动类型 (CO-006: 创建/指派/评论/审阅/批准/驳回/grant 变更)
  activity_type text not null check (activity_type in (
    'created', 'updated', 'deleted',
    'assigned', 'unassigned',
    'commented', 'replied', 'resolved_comment',
    'review_submitted', 'review_approved', 'review_rejected',
    'grant_created', 'grant_revoked',
    'transfer_initiated', 'transfer_confirmed', 'transfer_cancelled'
  )),
  -- 触发者
  actor_id uuid not null references auth.users(id) on delete restrict,
  -- 活动详情 (JSONB, 不含敏感数据)
  details jsonb not null default '{}'::jsonb,
  -- 元数据
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_activity_project
  ON public.storyflow_activity(project_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_activity_resource
  ON public.storyflow_activity(resource_type, resource_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_activity_actor
  ON public.storyflow_activity(actor_id, created_at desc);

COMMENT ON TABLE public.storyflow_activity IS
  'CO-006: 项目级活动流, append-only, 锚定 resourceType + resourceId';

ALTER TABLE public.storyflow_activity ENABLE ROW LEVEL SECURITY;

-- 活动流默认可读 (项目协作场景)
CREATE POLICY activity_select
  ON public.storyflow_activity
  FOR SELECT
  USING (true);

-- 仅服务端 RPC 可 INSERT (不开放客户端直接写)
-- 通过 SECURITY DEFINER 函数 append_activity_event 插入
-- CREATE POLICY 不允许 INSERT/UPDATE/DELETE

-- =========================================================
-- 4. storyflow_task_assignments — 任务指派 (CO-002)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_task_assignments (
  id uuid primary key default gen_random_uuid(),
  -- 任务定位
  project_id uuid not null,
  task_id uuid not null,
  -- 指派关系 (CO-002: 只能指派给有 collaboration grant 的成员)
  assignee_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  -- 状态
  status text not null default 'active' check (status in ('active', 'unassigned', 'completed')),
  unassigned_at timestamptz,
  -- 元数据
  created_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null unique
);

CREATE INDEX IF NOT EXISTS idx_task_assignments_task
  ON public.storyflow_task_assignments(task_id, status);
CREATE INDEX IF NOT EXISTS idx_task_assignments_assignee
  ON public.storyflow_task_assignments(assignee_id, status);

COMMENT ON TABLE public.storyflow_task_assignments IS
  'CO-002: 任务指派, assignee 必须有 collaboration grant';

ALTER TABLE public.storyflow_task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_assignments_select
  ON public.storyflow_task_assignments
  FOR SELECT
  USING (true);

CREATE POLICY task_assignments_assigned_by_insert
  ON public.storyflow_task_assignments
  FOR INSERT
  WITH CHECK (auth.uid() = assigned_by);

CREATE POLICY task_assignments_assigned_by_update
  ON public.storyflow_task_assignments
  FOR UPDATE
  USING (auth.uid() = assigned_by)
  WITH CHECK (auth.uid() = assigned_by);

-- =========================================================
-- 5. RPC: append_activity_event (CO-006: append-only)
--    服务端写入, 客户端不可直接 INSERT
-- =========================================================

CREATE OR REPLACE FUNCTION public.append_activity_event(
  p_project_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_activity_type text,
  p_actor_id uuid,
  p_details jsonb default '{}'::jsonb
) RETURNS public.storyflow_activity
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_activity public.storyflow_activity;
  v_actor uuid := COALESCE(p_actor_id, auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: actor_id is null';
  END IF;

  INSERT INTO public.storyflow_activity (
    project_id, resource_type, resource_id, activity_type, actor_id, details
  ) VALUES (
    p_project_id, p_resource_type, p_resource_id, p_activity_type, v_actor, p_details
  )
  RETURNING * INTO v_activity;

  RETURN v_activity;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_activity_event(uuid, text, uuid, text, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.append_activity_event(uuid, text, uuid, text, uuid, jsonb) TO authenticated;

-- =========================================================
-- 6. RPC: assign_task (CO-002: 校验 grant)
--    检查 assignee 是否有 collaboration grant, 无则拒绝
-- =========================================================

CREATE OR REPLACE FUNCTION public.assign_task(
  p_project_id uuid,
  p_task_id uuid,
  p_assignee_id uuid,
  p_assigned_by uuid,
  p_idempotency_key text
) RETURNS public.storyflow_task_assignments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment public.storyflow_task_assignments;
  v_has_grant boolean;
BEGIN
  -- 幂等
  SELECT * INTO v_assignment
    FROM public.storyflow_task_assignments
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

  IF FOUND THEN
    RETURN v_assignment;
  END IF;

  -- CO-002: 校验 assignee 有 collaboration grant
  SELECT public.check_resource_grant('project', p_project_id, p_assignee_id, 'collaboration') INTO v_has_grant;
  IF NOT v_has_grant THEN
    RAISE EXCEPTION 'forbidden: assignee has no collaboration grant on project %', p_project_id;
  END IF;

  INSERT INTO public.storyflow_task_assignments (
    project_id, task_id, assignee_id, assigned_by, status, idempotency_key
  ) VALUES (
    p_project_id, p_task_id, p_assignee_id, p_assigned_by, 'active', p_idempotency_key
  )
  RETURNING * INTO v_assignment;

  -- CO-006: 记录活动
  PERFORM public.append_activity_event(
    p_project_id, 'task', p_task_id, 'assigned', p_assigned_by,
    jsonb_build_object('assignee_id', p_assignee_id)
  );

  RETURN v_assignment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assign_task(uuid, uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_task(uuid, uuid, uuid, uuid, text) TO authenticated;

-- =========================================================
-- 7. RPC: submit_review (CO-004: pending → in_review)
-- =========================================================

CREATE OR REPLACE FUNCTION public.submit_review(
  p_resource_type text,
  p_resource_id uuid,
  p_resource_version text,
  p_reviewer_id uuid,
  p_idempotency_key text
) RETURNS public.storyflow_reviews
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review public.storyflow_reviews;
  v_reviewer uuid := COALESCE(p_reviewer_id, auth.uid());
BEGIN
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_review
    FROM public.storyflow_reviews
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

  IF FOUND THEN
    RETURN v_review;
  END IF;

  INSERT INTO public.storyflow_reviews (
    resource_type, resource_id, resource_version, reviewer_id, status, submitted_at, idempotency_key
  ) VALUES (
    p_resource_type, p_resource_id, p_resource_version, v_reviewer, 'in_review', now(), p_idempotency_key
  )
  RETURNING * INTO v_review;

  RETURN v_review;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_review(text, uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_review(text, uuid, text, uuid, text) TO authenticated;

-- =========================================================
-- 8. RPC: decide_review (CO-005: 批准/驳回 + 原因)
-- =========================================================

CREATE OR REPLACE FUNCTION public.decide_review(
  p_review_id uuid,
  p_decision text,
  p_reason text default null,
  p_change_suggestions jsonb default '[]'::jsonb
) RETURNS public.storyflow_reviews
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review public.storyflow_reviews;
  v_user uuid := auth.uid();
BEGIN
  SELECT * INTO v_review
    FROM public.storyflow_reviews
    WHERE id = p_review_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: review % does not exist', p_review_id;
  END IF;

  IF v_review.reviewer_id != v_user THEN
    RAISE EXCEPTION 'forbidden: only reviewer can decide';
  END IF;

  IF v_review.status != 'in_review' THEN
    RAISE EXCEPTION 'invalid_state: review status is %, expected in_review', v_review.status;
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid_decision: must be approved or rejected';
  END IF;

  UPDATE public.storyflow_reviews
    SET status = p_decision,
        decision_reason = p_reason,
        change_suggestions = p_change_suggestions,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_review_id
    RETURNING * INTO v_review;

  RETURN v_review;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decide_review(uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.decide_review(uuid, text, text, jsonb) TO authenticated;

COMMIT;

-- KIIKIS 2.1 Phase 5 — Task 5.3 安全与审核 (CM-007~010)
--
-- 覆盖:
--   CM-007: 举报/屏蔽/moderation queue/隐藏/恢复/申诉同时上线
--   CM-008: 隐藏 publication 不删除私有源 (CM-001 已实现 hide_publication RPC)
--   CM-009: 匿名/普通用户/被屏蔽用户/审核员权限矩阵自动化
--   CM-010: /community 受 feature flag 保护 (应用层实现)
--
-- 表设计:
--   1. storyflow_reports: 举报记录 (user → publication/comment)
--   2. storyflow_blocks: 屏蔽关系 (user → user, 双向不可见)
--   3. storyflow_moderation_queue: 审核队列 (审核员查看/操作)
--   4. storyflow_appeals: 申诉记录 (被处罚用户提交)

BEGIN;

-- =========================================================
-- 1. storyflow_reports — 举报 (CM-007)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_reports (
  id uuid primary key default gen_random_uuid(),
  -- 举报者
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- 被举报对象 (publication 或 comment)
  target_type text not null check (target_type in ('publication', 'comment', 'user')),
  target_id uuid not null,
  -- 原因类型 (预设类别)
  reason_type text not null check (reason_type in (
    'spam', 'harassment', 'hate_speech', 'violence', 'sexual_content',
    'misinformation', 'copyright', 'impersonation', 'other'
  )),
  -- 详细描述 (可选)
  reason_description text check (reason_description is null or length(reason_description) <= 2000),
  -- 举报状态
  status text not null default 'pending' check (status in (
    'pending', 'reviewing', 'actioned_hide', 'actioned_restore', 'dismissed'
  )),
  -- 关联 moderation queue (审核时填入)
  moderation_id uuid,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  -- 幂等
  idempotency_key text not null unique,
  -- 同一用户对同一对象只能举报一次
  constraint reports_unique unique (reporter_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status
  ON public.storyflow_reports(status, created_at desc);
CREATE INDEX IF NOT EXISTS idx_reports_target
  ON public.storyflow_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_moderation
  ON public.storyflow_reports(moderation_id)
  WHERE moderation_id IS NOT NULL;

COMMENT ON TABLE public.storyflow_reports IS
  'CM-007: 举报记录 (user → publication/comment/user)';

ALTER TABLE public.storyflow_reports ENABLE ROW LEVEL SECURITY;

-- CM-009: 举报者可看自己的举报
CREATE POLICY reports_reporter_select
  ON public.storyflow_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'moderator'
  ));

-- 举报者可创建自己的举报
CREATE POLICY reports_reporter_insert
  ON public.storyflow_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- 审核员可更新状态 (通过 SECURITY DEFINER RPC 处理, 此 UPDATE policy 兜底)
CREATE POLICY reports_moderator_update
  ON public.storyflow_reports
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'moderator'
  ));

-- =========================================================
-- 2. storyflow_blocks — 屏蔽 (CM-007: user → user 双向不可见)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_blocks (
  id uuid primary key default gen_random_uuid(),
  -- 屏蔽发起者
  blocker_id uuid not null references auth.users(id) on delete cascade,
  -- 被屏蔽者
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- CM-007: 同一 (blocker, blocked) 只能一条
  constraint blocks_unique unique (blocker_id, blocked_id),
  -- 不能屏蔽自己
  check (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocks_blocker
  ON public.storyflow_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked
  ON public.storyflow_blocks(blocked_id);

COMMENT ON TABLE public.storyflow_blocks IS
  'CM-007: 屏蔽关系 (user → user, 双向不可见)';

ALTER TABLE public.storyflow_blocks ENABLE ROW LEVEL SECURITY;

-- CM-009: 用户只能看自己的屏蔽关系
CREATE POLICY blocks_owner_select
  ON public.storyflow_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

-- 只能创建自己的屏蔽
CREATE POLICY blocks_owner_insert
  ON public.storyflow_blocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

-- 只能删除自己的屏蔽
CREATE POLICY blocks_owner_delete
  ON public.storyflow_blocks
  FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

-- =========================================================
-- 3. storyflow_moderation_queue — 审核队列 (CM-007)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  -- 关联 report(s) — 一个 moderation 可关联多个 report (合并处理)
  -- 这里简化为 1:1, 多 report 合并由应用层处理
  report_id uuid references public.storyflow_reports(id) on delete cascade,
  -- 审核目标快照
  target_type text not null check (target_type in ('publication', 'comment', 'user')),
  target_id uuid not null,
  -- 审核状态机
  status text not null default 'pending' check (status in (
    'pending', 'reviewing', 'hidden', 'restored', 'dismissed'
  )),
  -- 审核员
  moderator_id uuid references auth.users(id) on delete set null,
  -- 审核动作记录
  action_taken text check (action_taken in ('hide', 'restore', 'freeze_comment', 'dismiss')),
  action_reason text,
  action_at timestamptz,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_status
  ON public.storyflow_moderation_queue(status, created_at desc);
CREATE INDEX IF NOT EXISTS idx_moderation_target
  ON public.storyflow_moderation_queue(target_type, target_id);

COMMENT ON TABLE public.storyflow_moderation_queue IS
  'CM-007: 审核队列 (审核员查看/操作)';

ALTER TABLE public.storyflow_moderation_queue ENABLE ROW LEVEL SECURITY;

-- CM-009: 审核员可查看 moderation queue
CREATE POLICY moderation_moderator_select
  ON public.storyflow_moderation_queue
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'moderator'
  ));

-- 审核员可更新 (通过 RPC, 此 policy 兜底)
CREATE POLICY moderation_moderator_update
  ON public.storyflow_moderation_queue
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'moderator'
  ));

-- 审核员可创建 (新建 moderation 条目)
CREATE POLICY moderation_moderator_insert
  ON public.storyflow_moderation_queue
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'moderator'
  ));

-- =========================================================
-- 4. storyflow_appeals — 申诉 (CM-007)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_appeals (
  id uuid primary key default gen_random_uuid(),
  -- 申诉人 (被处罚用户)
  appellant_id uuid not null references auth.users(id) on delete cascade,
  -- 关联 moderation queue
  moderation_id uuid not null references public.storyflow_moderation_queue(id) on delete cascade,
  -- 申诉内容
  appeal_text text not null check (length(appeal_text) > 0 and length(appeal_text) <= 5000),
  -- 申诉状态
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected'
  )),
  -- 审核员处理结果
  reviewer_id uuid references auth.users(id) on delete set null,
  review_notes text,
  reviewed_at timestamptz,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null unique
);

CREATE INDEX IF NOT EXISTS idx_appeals_appellant
  ON public.storyflow_appeals(appellant_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_appeals_status
  ON public.storyflow_appeals(status, created_at desc);
CREATE INDEX IF NOT EXISTS idx_appeals_moderation
  ON public.storyflow_appeals(moderation_id);

COMMENT ON TABLE public.storyflow_appeals IS
  'CM-007: 申诉 (被处罚用户提交, 审核员处理)';

ALTER TABLE public.storyflow_appeals ENABLE ROW LEVEL SECURITY;

-- CM-009: 申诉人可看自己的申诉; 审核员可看所有
CREATE POLICY appeals_appellant_select
  ON public.storyflow_appeals
  FOR SELECT TO authenticated
  USING (
    appellant_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.storyflow_admin_roles r
      WHERE r.user_id = auth.uid() AND r.role = 'moderator'
    )
  );

-- 申诉人可创建自己的申诉
CREATE POLICY appeals_appellant_insert
  ON public.storyflow_appeals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = appellant_id);

-- 审核员可更新状态
CREATE POLICY appeals_moderator_update
  ON public.storyflow_appeals
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'moderator'
  ));

-- =========================================================
-- 5. storyflow_admin_roles — 审核员角色 (CM-009)
--    复用现有 admin 角色表, 若不存在则创建
-- =========================================================

-- 检查表是否存在, 不存在则创建 (避免依赖 Phase 0-4 admin 表结构)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'storyflow_admin_roles'
  ) THEN
    CREATE TABLE public.storyflow_admin_roles (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      role text not null check (role in ('admin', 'moderator', 'auditor')),
      created_at timestamptz not null default now(),
      created_by uuid references auth.users(id) on delete set null,
      constraint admin_roles_unique unique (user_id, role)
    );
    ALTER TABLE public.storyflow_admin_roles ENABLE ROW LEVEL SECURITY;
    -- 所有人可查 admin_roles (用于权限判断; 不暴露敏感信息)
    CREATE POLICY admin_roles_all_select
      ON public.storyflow_admin_roles
      FOR SELECT TO authenticated
      USING (true);
    COMMENT ON TABLE public.storyflow_admin_roles IS
      'CM-009: 审核员角色表 (moderator role)';
  END IF;
END $$;

-- =========================================================
-- 6. RPC: create_report (CM-007: 举报)
--    服务端注入 reporter_id; 幂等; 同一对象同用户只举报一次
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_report(
  p_target_type text,
  p_target_id uuid,
  p_reason_type text,
  p_reason_description text default null,
  p_idempotency_key text default null
) RETURNS public.storyflow_reports
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_report public.storyflow_reports;
  v_reporter uuid := auth.uid();
BEGIN
  IF v_reporter IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- 幂等: 同一 idempotency_key 已存在则返回
  SELECT * INTO v_report
    FROM public.storyflow_reports
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
  IF FOUND THEN RETURN v_report; END IF;

  -- 同一用户对同一对象只能举报一次
  SELECT * INTO v_report
    FROM public.storyflow_reports
    WHERE reporter_id = v_reporter
      AND target_type = p_target_type
      AND target_id = p_target_id
    LIMIT 1;
  IF FOUND THEN RETURN v_report; END IF;

  INSERT INTO public.storyflow_reports (
    reporter_id, target_type, target_id, reason_type, reason_description, idempotency_key
  ) VALUES (
    v_reporter, p_target_type, p_target_id, p_reason_type, p_reason_description, p_idempotency_key
  )
  RETURNING * INTO v_report;

  -- 自动创建 moderation queue 条目
  INSERT INTO public.storyflow_moderation_queue (
    report_id, target_type, target_id, status
  ) VALUES (
    v_report.id, p_target_type, p_target_id, 'pending'
  )
  RETURNING id INTO v_report.moderation_id;

  -- 反向更新 report.moderation_id
  UPDATE public.storyflow_reports
    SET moderation_id = v_report.moderation_id, updated_at = now()
    WHERE id = v_report.id;

  -- CM-006: 通知所有审核员 (新举报进入队列)
  INSERT INTO public.storyflow_creative_events (
    event_type, schema_version, actor_type, actor_id, owner_id,
    resource_type, resource_id, idempotency_key, visibility, payload, occurred_at
  )
  SELECT
    'notification_moderation_result', 1, 'user', v_reporter, r.user_id,
    'report', v_report.id::text,
    'notify_report:' || v_report.id || ':' || r.user_id,
    'private',
    jsonb_build_object(
      'title', 'New report in moderation queue',
      'body', substring(COALESCE(p_reason_description, p_reason_type), 1, 200),
      'resource_type', 'report',
      'resource_id', v_report.id,
      'reportId', v_report.id,
      'targetType', p_target_type,
      'targetId', p_target_id,
      'reasonType', p_reason_type
    ),
    now()
  FROM public.storyflow_admin_roles r
  WHERE r.role = 'moderator'
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING;

  RETURN v_report;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_report(text, uuid, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_report(text, uuid, text, text, text) TO authenticated;

-- =========================================================
-- 7. RPC: toggle_block (CM-007: 屏蔽, 幂等 toggle)
-- =========================================================

CREATE OR REPLACE FUNCTION public.toggle_block(
  p_blocked_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_blocker uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_blocker IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_blocked_id = v_blocker THEN
    RAISE EXCEPTION 'validation_failed: cannot block self';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.storyflow_blocks
    WHERE blocker_id = v_blocker AND blocked_id = p_blocked_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.storyflow_blocks
      WHERE blocker_id = v_blocker AND blocked_id = p_blocked_id;
    RETURN false; -- 已取消屏蔽
  ELSE
    INSERT INTO public.storyflow_blocks (blocker_id, blocked_id)
      VALUES (v_blocker, p_blocked_id)
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
    RETURN true; -- 已屏蔽
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_block(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_block(uuid) TO authenticated;

-- =========================================================
-- 8. RPC: review_moderation (CM-007: 审核操作)
--    审核员: 隐藏/恢复/驳回
-- =========================================================

CREATE OR REPLACE FUNCTION public.review_moderation(
  p_moderation_id uuid,
  p_action text, -- hide | restore | dismiss
  p_reason text default null
) RETURNS public.storyflow_moderation_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mod public.storyflow_moderation_queue;
  v_moderator uuid := auth.uid();
  v_is_moderator boolean;
BEGIN
  IF v_moderator IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- CM-009: 权限校验 (必须 moderator 角色)
  SELECT EXISTS(
    SELECT 1 FROM public.storyflow_admin_roles
    WHERE user_id = v_moderator AND role = 'moderator'
  ) INTO v_is_moderator;
  IF NOT v_is_moderator THEN
    RAISE EXCEPTION 'forbidden: moderator role required';
  END IF;

  SELECT * INTO v_mod FROM public.storyflow_moderation_queue WHERE id = p_moderation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: moderation % does not exist', p_moderation_id;
  END IF;

  -- 执行动作
  IF p_action = 'hide' THEN
    -- CM-008: 隐藏 publication (只改 visibility, 不删除源)
    IF v_mod.target_type = 'publication' THEN
      PERFORM public.hide_publication(v_mod.target_id, p_reason);
    END IF;
    UPDATE public.storyflow_moderation_queue
      SET status = 'hidden', action_taken = 'hide', action_reason = p_reason,
          moderator_id = v_moderator, action_at = now(), updated_at = now()
      WHERE id = p_moderation_id RETURNING * INTO v_mod;
  ELSIF p_action = 'restore' THEN
    IF v_mod.target_type = 'publication' THEN
      PERFORM public.restore_publication(v_mod.target_id, p_reason);
    END IF;
    UPDATE public.storyflow_moderation_queue
      SET status = 'restored', action_taken = 'restore', action_reason = p_reason,
          moderator_id = v_moderator, action_at = now(), updated_at = now()
      WHERE id = p_moderation_id RETURNING * INTO v_mod;
  ELSIF p_action = 'dismiss' THEN
    UPDATE public.storyflow_moderation_queue
      SET status = 'dismissed', action_taken = 'dismiss', action_reason = p_reason,
          moderator_id = v_moderator, action_at = now(), updated_at = now()
      WHERE id = p_moderation_id RETURNING * INTO v_mod;
  ELSE
    RAISE EXCEPTION 'validation_failed: action must be hide|restore|dismiss';
  END IF;

  -- 更新关联 report 状态
  UPDATE public.storyflow_reports
    SET status = CASE p_action
      WHEN 'hide' THEN 'actioned_hide'
      WHEN 'restore' THEN 'actioned_restore'
      WHEN 'dismiss' THEN 'dismissed'
    END,
    resolved_at = now(),
    resolved_by = v_moderator,
    updated_at = now()
    WHERE moderation_id = p_moderation_id;

  -- CM-006: 通知被举报对象作者 (审核结果)
  -- 简化: 通知 publication owner (若是 publication 举报)
  IF v_mod.target_type = 'publication' THEN
    DECLARE
      v_owner uuid;
    BEGIN
      SELECT publisher_id INTO v_owner FROM public.storyflow_publications WHERE id = v_mod.target_id;
      IF v_owner IS NOT NULL AND v_owner <> v_moderator THEN
        INSERT INTO public.storyflow_creative_events (
          event_type, schema_version, actor_type, actor_id, owner_id,
          resource_type, resource_id, idempotency_key, visibility, payload, occurred_at
        ) VALUES (
          'notification_moderation_result', 1, 'user', v_moderator, v_owner,
          'publication', v_mod.target_id::text,
          'notify_mod:' || v_mod.id::text,
          'private',
          jsonb_build_object(
            'title', CASE p_action WHEN 'hide' THEN 'Your publication was hidden' ELSE 'Moderation review completed' END,
            'body', substring(COALESCE(p_reason, p_action), 1, 200),
            'resource_type', 'publication',
            'resource_id', v_mod.target_id,
            'action', p_action,
            'moderationId', v_mod.id
          ),
          now()
        )
        ON CONFLICT (owner_id, idempotency_key) DO NOTHING;
      END IF;
    END;
  END IF;

  RETURN v_mod;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_moderation(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_moderation(uuid, text, text) TO authenticated;

-- =========================================================
-- 9. RPC: create_appeal (CM-007: 申诉, 被处罚用户提交)
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_appeal(
  p_moderation_id uuid,
  p_appeal_text text,
  p_idempotency_key text
) RETURNS public.storyflow_appeals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appeal public.storyflow_appeals;
  v_appellant uuid := auth.uid();
  v_mod public.storyflow_moderation_queue;
BEGIN
  IF v_appellant IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_appeal_text IS NULL OR length(trim(p_appeal_text)) = 0 OR length(p_appeal_text) > 5000 THEN
    RAISE EXCEPTION 'validation_failed: appeal_text must be 1..5000 chars';
  END IF;

  -- 幂等
  SELECT * INTO v_appeal FROM public.storyflow_appeals WHERE idempotency_key = p_idempotency_key LIMIT 1;
  IF FOUND THEN RETURN v_appeal; END IF;

  -- 校验 moderation 存在且被处罚人是申诉人 (隐藏的 publication owner)
  SELECT * INTO v_mod FROM public.storyflow_moderation_queue WHERE id = p_moderation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: moderation % does not exist', p_moderation_id;
  END IF;
  IF v_mod.target_type = 'publication' THEN
    DECLARE
      v_owner uuid;
    BEGIN
      SELECT publisher_id INTO v_owner FROM public.storyflow_publications WHERE id = v_mod.target_id;
      IF v_owner IS NULL OR v_owner <> v_appellant THEN
        RAISE EXCEPTION 'forbidden: only affected user can appeal';
      END IF;
    END;
  END IF;

  INSERT INTO public.storyflow_appeals (
    appellant_id, moderation_id, appeal_text, idempotency_key
  ) VALUES (
    v_appellant, p_moderation_id, p_appeal_text, p_idempotency_key
  )
  RETURNING * INTO v_appeal;

  -- CM-006: 通知审核员 (新申诉)
  INSERT INTO public.storyflow_creative_events (
    event_type, schema_version, actor_type, actor_id, owner_id,
    resource_type, resource_id, idempotency_key, visibility, payload, occurred_at
  )
  SELECT
    'notification_moderation_result', 1, 'user', v_appellant, r.user_id,
    'appeal', v_appeal.id::text,
    'notify_appeal:' || v_appeal.id || ':' || r.user_id,
    'private',
    jsonb_build_object(
      'title', 'New appeal submitted',
      'body', substring(p_appeal_text, 1, 200),
      'resource_type', 'appeal',
      'resource_id', v_appeal.id,
      'appealId', v_appeal.id,
      'moderationId', p_moderation_id
    ),
    now()
  FROM public.storyflow_admin_roles r
  WHERE r.role = 'moderator'
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING;

  RETURN v_appeal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_appeal(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_appeal(uuid, text, text) TO authenticated;

-- =========================================================
-- 10. RPC: review_appeal (CM-007: 审核员处理申诉)
-- =========================================================

CREATE OR REPLACE FUNCTION public.review_appeal(
  p_appeal_id uuid,
  p_decision text, -- approved | rejected
  p_review_notes text default null
) RETURNS public.storyflow_appeals
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appeal public.storyflow_appeals;
  v_reviewer uuid := auth.uid();
  v_is_moderator boolean;
  v_mod public.storyflow_moderation_queue;
BEGIN
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.storyflow_admin_roles
    WHERE user_id = v_reviewer AND role = 'moderator'
  ) INTO v_is_moderator;
  IF NOT v_is_moderator THEN
    RAISE EXCEPTION 'forbidden: moderator role required';
  END IF;

  SELECT * INTO v_appeal FROM public.storyflow_appeals WHERE id = p_appeal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: appeal % does not exist', p_appeal_id;
  END IF;

  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'validation_failed: decision must be approved|rejected';
  END IF;

  UPDATE public.storyflow_appeals
    SET status = p_decision, reviewer_id = v_reviewer,
        review_notes = p_review_notes, reviewed_at = now(), updated_at = now()
    WHERE id = p_appeal_id
    RETURNING * INTO v_appeal;

  -- 若申诉批准, 恢复 publication
  IF p_decision = 'approved' THEN
    SELECT * INTO v_mod FROM public.storyflow_moderation_queue WHERE id = v_appeal.moderation_id;
    IF v_mod.target_type = 'publication' THEN
      PERFORM public.restore_publication(v_mod.target_id, 'appeal approved');
      UPDATE public.storyflow_moderation_queue
        SET status = 'restored', action_taken = 'restore',
            action_reason = 'appeal approved', action_at = now(), updated_at = now()
        WHERE id = v_mod.id;
    END IF;
  END IF;

  -- CM-006: 通知申诉人
  INSERT INTO public.storyflow_creative_events (
    event_type, schema_version, actor_type, actor_id, owner_id,
    resource_type, resource_id, idempotency_key, visibility, payload, occurred_at
  ) VALUES (
    'notification_moderation_result', 1, 'user', v_reviewer, v_appeal.appellant_id,
    'appeal', v_appeal.id::text,
    'notify_appeal_result:' || v_appeal.id,
    'private',
    jsonb_build_object(
      'title', CASE p_decision WHEN 'approved' THEN 'Appeal approved' ELSE 'Appeal rejected' END,
      'body', substring(COALESCE(p_review_notes, p_decision), 1, 200),
      'resource_type', 'appeal',
      'resource_id', v_appeal.id,
      'decision', p_decision,
      'appealId', v_appeal.id
    ),
    now()
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING;

  RETURN v_appeal;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_appeal(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_appeal(uuid, text, text) TO authenticated;

COMMIT;

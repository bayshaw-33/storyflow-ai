-- KIIKIS 2.1 Phase 5 — Task 5.2 评论与通知 (CM-004, CM-006)
--
-- 覆盖:
--   CM-004: 评论支持回复、软删除、冻结和审核证据
--   CM-006: 通知由 creative_events 生成 (不新建 notifications 表)
--
-- 设计原则:
--   1. 评论锚定 publication_id + parent_comment_id (回复层级)
--   2. 软删除: deleted_at 标记, 不物理删除
--   3. 冻结: frozen_by + frozen_reason + frozen_at (审核冻结)
--   4. moderation_id 关联 Phase 5.3 moderation queue (NULL 时未审核)
--   5. body 内容 append-only — 创建后不可修改 (只能软删除)
--   6. 通知复用 Phase 1 creative_events 表 (event_type=notification_*)
--   7. RLS: 公开 publication 评论可读; 只 author 可软删除自己的评论

BEGIN;

-- =========================================================
-- 1. storyflow_comments — 评论 (CM-004)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_comments (
  id uuid primary key default gen_random_uuid(),
  -- CM-004: 锚定 publication + parent (回复)
  publication_id uuid not null references public.storyflow_publications(id) on delete cascade,
  parent_comment_id uuid references public.storyflow_comments(id) on delete cascade,
  -- 作者 (服务端注入, 与 publications.publisher_id 解耦)
  author_id uuid not null references auth.users(id) on delete cascade,
  -- 评论内容 (append-only, 创建后不可修改)
  body text not null check (length(body) > 0 and length(body) <= 2000),
  -- CM-004: 软删除 (deleted_at 标记, 不物理删除)
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  -- CM-004: 冻结 (审核冻结)
  frozen_at timestamptz,
  frozen_by uuid references auth.users(id) on delete set null,
  frozen_reason text,
  -- CM-004: 审核证据 (关联 Phase 5.3 moderation queue)
  moderation_id uuid,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 幂等键 (同 author + body + publication + parent 幂等)
  idempotency_key text not null unique,
  -- CM-004: 防止循环引用 (parent_comment_id 不能等于 id)
  check (parent_comment_id is null or parent_comment_id <> id)
);

-- CO-003 先于 CM-004 创建了同名协作评论表。兼容已存在的旧表，补齐
-- publication 评论所需字段，不删除或重建既有评论数据。
ALTER TABLE public.storyflow_comments
  ADD COLUMN IF NOT EXISTS publication_id uuid REFERENCES public.storyflow_publications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frozen_reason text,
  ADD COLUMN IF NOT EXISTS moderation_id uuid;

CREATE INDEX IF NOT EXISTS idx_comments_publication
  ON public.storyflow_comments(publication_id, created_at asc);
CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON public.storyflow_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comments_author
  ON public.storyflow_comments(author_id, created_at desc);

COMMENT ON TABLE public.storyflow_comments IS
  'CM-004: 评论支持回复/软删除/冻结/审核证据';

ALTER TABLE public.storyflow_comments ENABLE ROW LEVEL SECURITY;

-- CM-009 权限矩阵: 评论可见性跟随 publication 可见性
-- - public publication 评论对所有 authenticated 可读
-- - invite_only 仅持 token 者可读 (由 publication RLS 兜底)
-- - 评论 author 可读自己的所有评论
CREATE POLICY comments_select
  ON public.storyflow_comments
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.storyflow_publications p
      WHERE p.id = publication_id
        AND (p.visibility = 'public' OR p.publisher_id = auth.uid())
        AND p.status = 'active'
    )
  );

-- 评论只能 author 自己创建
CREATE POLICY publication_comments_author_insert
  ON public.storyflow_comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- 评论只能 author 软删除 (审核冻结由 moderation 服务走 SECURITY DEFINER)
CREATE POLICY publication_comments_author_update
  ON public.storyflow_comments
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- 作者可软删除自己的评论
CREATE POLICY publication_comments_author_delete
  ON public.storyflow_comments
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

-- =========================================================
-- 2. Guard Trigger: body 内容 append-only (CM-004)
--    防止 service_role 误操作修改评论内容
-- =========================================================

CREATE OR REPLACE FUNCTION public.storyflow_comments_body_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- 只允许修改 deleted_at / frozen_* / moderation_id / updated_at
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION 'storyflow_comments.body is append-only: modification not allowed (comment id=%)',
      OLD.id;
  END IF;
  IF NEW.publication_id IS DISTINCT FROM OLD.publication_id THEN
    RAISE EXCEPTION 'storyflow_comments.publication_id is immutable (comment id=%)', OLD.id;
  END IF;
  IF NEW.parent_comment_id IS DISTINCT FROM OLD.parent_comment_id THEN
    RAISE EXCEPTION 'storyflow_comments.parent_comment_id is immutable (comment id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storyflow_comments_body_immutable_guard ON public.storyflow_comments;
CREATE TRIGGER storyflow_comments_body_immutable_guard
  BEFORE UPDATE ON public.storyflow_comments
  FOR EACH ROW EXECUTE FUNCTION public.storyflow_comments_body_immutable_guard();

-- =========================================================
-- 3. RPC: create_comment (CM-004: 服务端注入 author_id)
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_comment(
  p_publication_id uuid,
  p_parent_comment_id uuid default null,
  p_body text default null,
  p_idempotency_key text default null
) RETURNS public.storyflow_comments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment public.storyflow_comments;
  v_author uuid := auth.uid();
  v_pub public.storyflow_publications;
BEGIN
  IF v_author IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_body IS NULL OR length(trim(p_body)) = 0 OR length(p_body) > 2000 THEN
    RAISE EXCEPTION 'validation_failed: body must be 1..2000 chars';
  END IF;

  -- 校验 publication 存在且可评论
  SELECT * INTO v_pub FROM public.storyflow_publications WHERE id = p_publication_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: publication % does not exist', p_publication_id;
  END IF;
  IF v_pub.status <> 'active' THEN
    RAISE EXCEPTION 'forbidden: publication is not active';
  END IF;

  -- 校验 parent_comment_id 属于同一 publication 且未被冻结/删除
  IF p_parent_comment_id IS NOT NULL THEN
    DECLARE
      v_parent public.storyflow_comments;
    BEGIN
      SELECT * INTO v_parent FROM public.storyflow_comments WHERE id = p_parent_comment_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found: parent comment % does not exist', p_parent_comment_id;
      END IF;
      IF v_parent.publication_id <> p_publication_id THEN
        RAISE EXCEPTION 'validation_failed: parent comment does not belong to publication';
      END IF;
      IF v_parent.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'forbidden: parent comment is deleted';
      END IF;
      IF v_parent.frozen_at IS NOT NULL THEN
        RAISE EXCEPTION 'forbidden: parent comment is frozen';
      END IF;
    END;
  END IF;

  -- 幂等
  SELECT * INTO v_comment
    FROM public.storyflow_comments
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

  IF FOUND THEN
    RETURN v_comment;
  END IF;

  INSERT INTO public.storyflow_comments (
    publication_id, parent_comment_id, author_id, body, idempotency_key
  ) VALUES (
    p_publication_id, p_parent_comment_id, v_author, p_body, p_idempotency_key
  )
  RETURNING * INTO v_comment;

  -- 更新 publication 评论计数 (CM-002 计数缓存)
  UPDATE public.storyflow_publications
    SET comment_count = comment_count + 1, updated_at = now()
    WHERE id = p_publication_id;

  -- CM-006: 写入通知事件 (creative_events, 通知 publication 作者)
  -- 只在评论者 != publication 作者时通知
  IF v_pub.publisher_id <> v_author THEN
    INSERT INTO public.storyflow_creative_events (
      event_type, schema_version, actor_type, actor_id, owner_id,
      resource_type, resource_id, idempotency_key, visibility, payload, occurred_at
    ) VALUES (
      'notification_comment', 1, 'user', v_author, v_pub.publisher_id,
      'comment', v_comment.id::text,
      'notify_comment:' || v_comment.id,
      'private',
      jsonb_build_object(
        'commentId', v_comment.id,
        'publicationId', v_pub.id,
        'publicationTitle', v_pub.title,
        'body', substring(p_body, 1, 200),
        'actorId', v_author
      ),
      now()
    )
    ON CONFLICT (owner_id, idempotency_key) DO NOTHING;
  END IF;

  RETURN v_comment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_comment(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_comment(uuid, uuid, text, text) TO authenticated;

-- =========================================================
-- 4. RPC: soft_delete_comment (CM-004: 软删除)
-- =========================================================

CREATE OR REPLACE FUNCTION public.soft_delete_comment(
  p_comment_id uuid,
  p_reason text default null
) RETURNS public.storyflow_comments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment public.storyflow_comments;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_comment FROM public.storyflow_comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: comment % does not exist', p_comment_id;
  END IF;

  -- 只有 author 可软删除 (除非 moderator — 由 moderation 服务走另一路径)
  IF v_comment.author_id <> v_user THEN
    RAISE EXCEPTION 'forbidden: only author can soft delete';
  END IF;

  IF v_comment.deleted_at IS NOT NULL THEN
    RETURN v_comment; -- 幂等
  END IF;

  UPDATE public.storyflow_comments
    SET deleted_at = now(), deleted_by = v_user, updated_at = now()
    WHERE id = p_comment_id
    RETURNING * INTO v_comment;

  -- 更新 publication 评论计数
  UPDATE public.storyflow_publications
    SET comment_count = GREATEST(comment_count - 1, 0), updated_at = now()
    WHERE id = v_comment.publication_id;

  RETURN v_comment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.soft_delete_comment(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_comment(uuid, text) TO authenticated;

-- =========================================================
-- 5. RPC: freeze_comment (CM-004: 审核冻结, Phase 5.3 moderation 用)
-- =========================================================

CREATE OR REPLACE FUNCTION public.freeze_comment(
  p_comment_id uuid,
  p_reason text,
  p_moderator_id uuid default null,
  p_moderation_id uuid default null
) RETURNS public.storyflow_comments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment public.storyflow_comments;
  v_user uuid := COALESCE(p_moderator_id, auth.uid());
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_comment FROM public.storyflow_comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  UPDATE public.storyflow_comments
    SET frozen_at = now(),
        frozen_by = v_user,
        frozen_reason = p_reason,
        moderation_id = COALESCE(p_moderation_id, moderation_id),
        updated_at = now()
    WHERE id = p_comment_id
    RETURNING * INTO v_comment;

  -- CM-004: 写入审核冻结证据事件 (CM-006 通知)
  INSERT INTO public.storyflow_creative_events (
    event_type, schema_version, actor_type, actor_id, owner_id,
    resource_type, resource_id, idempotency_key, visibility, payload, occurred_at
  ) VALUES (
    'notification_moderation_freeze', 1, 'user', v_user, v_comment.author_id,
    'comment', v_comment.id::text,
    'notify_freeze:' || v_comment.id,
    'private',
    jsonb_build_object(
      'commentId', v_comment.id,
      'publicationId', v_comment.publication_id,
      'reason', p_reason,
      'moderatorId', v_user
    ),
    now()
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING;

  RETURN v_comment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.freeze_comment(uuid, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.freeze_comment(uuid, text, uuid, uuid) TO authenticated;

-- =========================================================
-- 6. RPC: unfreeze_comment (Phase 5.3 moderation 用)
-- =========================================================

CREATE OR REPLACE FUNCTION public.unfreeze_comment(
  p_comment_id uuid,
  p_reason text default null
) RETURNS public.storyflow_comments
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment public.storyflow_comments;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_comment FROM public.storyflow_comments WHERE id = p_comment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  UPDATE public.storyflow_comments
    SET frozen_at = null,
        frozen_by = null,
        frozen_reason = null,
        updated_at = now()
    WHERE id = p_comment_id
    RETURNING * INTO v_comment;

  RETURN v_comment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unfreeze_comment(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.unfreeze_comment(uuid, text) TO authenticated;

-- =========================================================
-- 7. RPC: mark_notification_read (CM-006: 通知已读)
--    通过修改 creative_events.visibility 实现 (private → 'read')
--    注意: creative_events 是 append-only, 这里用单独的 read 状态表
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.storyflow_creative_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON public.storyflow_notification_reads(user_id, read_at desc);

COMMENT ON TABLE public.storyflow_notification_reads IS
  'CM-006: 通知已读状态 (与 creative_events 解耦, append-only 不破坏)';

ALTER TABLE public.storyflow_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_reads_owner_select
  ON public.storyflow_notification_reads
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notification_reads_owner_insert
  ON public.storyflow_notification_reads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =========================================================
-- 8. RPC: mark_notification_read (CM-006)
-- =========================================================

CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_event_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  INSERT INTO public.storyflow_notification_reads (user_id, event_id)
    VALUES (v_user, p_event_id)
    ON CONFLICT (user_id, event_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

COMMIT;

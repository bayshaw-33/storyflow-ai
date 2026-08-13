-- KIIKIS 2.1 Phase 5 — Task 5.1 IP 资产社区 (CM-001~003, CM-005)
--
-- 覆盖:
--   CM-001: publication 与源资源分离 (保存快照, 隐藏不删除源)
--   CM-002: 发现页只读取允许公开/邀请访问的投影
--   CM-003: 关注/反应/收藏唯一且幂等
--   CM-005: 对象页明确来源/owner/许可状态/允许动作
--
-- 表设计原则:
--   1. publications 保存源资源快照 (resourceType + resourceId + version), 不等于源资源 (CM-001)
--   2. visibility ∈ {public, invite_only, hidden} — 隐藏只改 visibility (CM-008)
--   3. follows/reactions/bookmarks 唯一约束 + ON CONFLICT DO NOTHING 幂等 (CM-003)
--   4. 发现页查询 publications 投影, 不查私有资源表 (CM-002)
--   5. 所有表 RLS: public 可读, owner 可写

BEGIN;

-- =========================================================
-- 1. storyflow_publications — 发布 (CM-001/002/005)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_publications (
  id uuid primary key default gen_random_uuid(),
  -- CM-001: 源资源快照 (不等于源资源)
  source_type text not null check (source_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene')),
  source_id uuid not null,
  source_version text, -- 发布时版本快照
  -- 发布者 (owner)
  publisher_id uuid not null references auth.users(id) on delete restrict,
  -- 投影内容 (CM-002: 发现页只读这些字段, 不查源资源)
  title text not null check (length(title) > 0 and length(title) <= 200),
  summary text not null default '' check (length(summary) <= 2000),
  cover_url text,
  -- CM-001: 可见性 — 隐藏只改 visibility, 不删除源 (CM-008)
  visibility text not null default 'public' check (visibility in ('public', 'invite_only', 'hidden')),
  -- CM-005: 当前许可/状态信息
  status text not null default 'active' check (status in ('active', 'hidden_by_moderator', 'removed')),
  -- 邀请 token (invite_only 时需要)
  invite_token_hash text,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null unique,
  -- 统计缓存 (CM-002: 避免发现页全量聚合)
  follow_count integer not null default 0,
  reaction_count integer not null default 0,
  bookmark_count integer not null default 0,
  comment_count integer not null default 0,
  check (follow_count >= 0),
  check (reaction_count >= 0),
  check (bookmark_count >= 0),
  check (comment_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_publications_visibility
  ON public.storyflow_publications(visibility, created_at desc)
  WHERE visibility != 'hidden';
CREATE INDEX IF NOT EXISTS idx_publications_publisher
  ON public.storyflow_publications(publisher_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_publications_source
  ON public.storyflow_publications(source_type, source_id);

COMMENT ON TABLE public.storyflow_publications IS
  'CM-001/002: publication 与源资源分离, 发现页只读投影';

ALTER TABLE public.storyflow_publications ENABLE ROW LEVEL SECURITY;

-- CM-009: 匿名用户可读 public, 认证用户可读 public+invite_only
-- hidden 只能 owner 或审核员读
CREATE POLICY publications_select
  ON public.storyflow_publications
  FOR SELECT
  USING (
    visibility = 'public' AND status = 'active'
    OR publisher_id = auth.uid()
    OR (visibility = 'invite_only' AND status = 'active' AND auth.uid() IS NOT NULL)
  );

-- 只有 publisher 可创建/更新自己的 publication
CREATE POLICY publications_publisher_insert
  ON public.storyflow_publications
  FOR INSERT
  WITH CHECK (auth.uid() = publisher_id);

CREATE POLICY publications_publisher_update
  ON public.storyflow_publications
  FOR UPDATE
  USING (auth.uid() = publisher_id)
  WITH CHECK (auth.uid() = publisher_id);

-- =========================================================
-- 2. storyflow_follows — 关注 (CM-003: 唯一+幂等)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  -- 关注目标 (creator 或 universe)
  target_type text not null check (target_type in ('user', 'universe', 'publication')),
  target_id uuid not null,
  -- 元数据
  created_at timestamptz not null default now(),
  -- CM-003: 唯一约束
  constraint follows_unique unique (follower_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_target
  ON public.storyflow_follows(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower
  ON public.storyflow_follows(follower_id);

COMMENT ON TABLE public.storyflow_follows IS
  'CM-003: follow 唯一约束 + 幂等';

ALTER TABLE public.storyflow_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY follows_select
  ON public.storyflow_follows
  FOR SELECT
  USING (true);

CREATE POLICY follows_owner_insert
  ON public.storyflow_follows
  FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY follows_owner_delete
  ON public.storyflow_follows
  FOR DELETE
  USING (auth.uid() = follower_id);

-- =========================================================
-- 3. storyflow_reactions — 反应 (CM-003: 唯一+幂等)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_id uuid not null references public.storyflow_publications(id) on delete cascade,
  -- 反应类型 (like/love/wow 等)
  reaction_type text not null check (reaction_type in ('like', 'love', 'wow', 'haha', 'sad', 'angry')),
  -- 元数据
  created_at timestamptz not null default now(),
  -- CM-003: 唯一约束 (同用户同 publication 同类型只能一条)
  constraint reactions_unique unique (user_id, publication_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_reactions_publication
  ON public.storyflow_reactions(publication_id, reaction_type);
CREATE INDEX IF NOT EXISTS idx_reactions_user
  ON public.storyflow_reactions(user_id);

COMMENT ON TABLE public.storyflow_reactions IS
  'CM-003: reaction 唯一约束 + 幂等';

ALTER TABLE public.storyflow_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY reactions_select
  ON public.storyflow_reactions
  FOR SELECT
  USING (true);

CREATE POLICY reactions_owner_insert
  ON public.storyflow_reactions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY reactions_owner_delete
  ON public.storyflow_reactions
  FOR DELETE
  USING (auth.uid() = user_id);

-- =========================================================
-- 4. storyflow_bookmarks — 收藏 (CM-003: 唯一+幂等)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publication_id uuid not null references public.storyflow_publications(id) on delete cascade,
  -- 元数据
  created_at timestamptz not null default now(),
  -- CM-003: 唯一约束
  constraint bookmarks_unique unique (user_id, publication_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user
  ON public.storyflow_bookmarks(user_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_bookmarks_publication
  ON public.storyflow_bookmarks(publication_id);

COMMENT ON TABLE public.storyflow_bookmarks IS
  'CM-003: bookmark 唯一约束 + 幂等';

ALTER TABLE public.storyflow_bookmarks ENABLE ROW LEVEL SECURITY;

-- bookmarks 只能 owner 读 (隐私)
CREATE POLICY bookmarks_owner_select
  ON public.storyflow_bookmarks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY bookmarks_owner_insert
  ON public.storyflow_bookmarks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmarks_owner_delete
  ON public.storyflow_bookmarks
  FOR DELETE
  USING (auth.uid() = user_id);

-- =========================================================
-- 5. RPC: create_publication (CM-001: 服务端写入 publisher_id)
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_publication(
  p_source_type text,
  p_source_id uuid,
  p_source_version text,
  p_title text,
  p_summary text default '',
  p_cover_url text default null,
  p_visibility text default 'public',
  p_invite_token_hash text default null,
  p_idempotency_key text
) RETURNS public.storyflow_publications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pub public.storyflow_publications;
  v_publisher uuid := auth.uid();
BEGIN
  IF v_publisher IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- 幂等
  SELECT * INTO v_pub
    FROM public.storyflow_publications
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

  IF FOUND THEN
    RETURN v_pub;
  END IF;

  INSERT INTO public.storyflow_publications (
    source_type, source_id, source_version, publisher_id,
    title, summary, cover_url, visibility, invite_token_hash, idempotency_key
  ) VALUES (
    p_source_type, p_source_id, p_source_version, v_publisher,
    p_title, p_summary, p_cover_url, p_visibility, p_invite_token_hash, p_idempotency_key
  )
  RETURNING * INTO v_pub;

  RETURN v_pub;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_publication(text, uuid, text, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_publication(text, uuid, text, text, text, text, text, text, text) TO authenticated;

-- =========================================================
-- 6. RPC: toggle_follow (CM-003: 幂等 toggle)
-- =========================================================

CREATE OR REPLACE FUNCTION public.toggle_follow(
  p_target_type text,
  p_target_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_follower uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_follower IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.storyflow_follows
    WHERE follower_id = v_follower
      AND target_type = p_target_type
      AND target_id = p_target_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.storyflow_follows
      WHERE follower_id = v_follower
        AND target_type = p_target_type
        AND target_id = p_target_id;
    RETURN false; -- 已取消关注
  ELSE
    INSERT INTO public.storyflow_follows (follower_id, target_type, target_id)
      VALUES (v_follower, p_target_type, p_target_id)
      ON CONFLICT (follower_id, target_type, target_id) DO NOTHING;
    RETURN true; -- 已关注
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_follow(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_follow(text, uuid) TO authenticated;

-- =========================================================
-- 7. RPC: toggle_reaction (CM-003: 幂等 toggle)
-- =========================================================

CREATE OR REPLACE FUNCTION public.toggle_reaction(
  p_publication_id uuid,
  p_reaction_type text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.storyflow_reactions
    WHERE user_id = v_user
      AND publication_id = p_publication_id
      AND reaction_type = p_reaction_type
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.storyflow_reactions
      WHERE user_id = v_user
        AND publication_id = p_publication_id
        AND reaction_type = p_reaction_type;
    RETURN false;
  ELSE
    INSERT INTO public.storyflow_reactions (user_id, publication_id, reaction_type)
      VALUES (v_user, p_publication_id, p_reaction_type)
      ON CONFLICT (user_id, publication_id, reaction_type) DO NOTHING;
    RETURN true;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_reaction(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_reaction(uuid, text) TO authenticated;

-- =========================================================
-- 8. RPC: toggle_bookmark (CM-003: 幂等 toggle)
-- =========================================================

CREATE OR REPLACE FUNCTION public.toggle_bookmark(
  p_publication_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.storyflow_bookmarks
    WHERE user_id = v_user
      AND publication_id = p_publication_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.storyflow_bookmarks
      WHERE user_id = v_user
        AND publication_id = p_publication_id;
    RETURN false;
  ELSE
    INSERT INTO public.storyflow_bookmarks (user_id, publication_id)
      VALUES (v_user, p_publication_id)
      ON CONFLICT (user_id, publication_id) DO NOTHING;
    RETURN true;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.toggle_bookmark(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_bookmark(uuid) TO authenticated;

-- =========================================================
-- 9. RPC: hide_publication (CM-008: 隐藏不删除源)
--    只改 visibility, source_* 不动
-- =========================================================

CREATE OR REPLACE FUNCTION public.hide_publication(
  p_publication_id uuid,
  p_reason text default null
) RETURNS public.storyflow_publications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pub public.storyflow_publications;
BEGIN
  SELECT * INTO v_pub
    FROM public.storyflow_publications
    WHERE id = p_publication_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: publication % does not exist', p_publication_id;
  END IF;

  -- CM-008: 只改 visibility, 不删除源资源
  UPDATE public.storyflow_publications
    SET visibility = 'hidden',
        status = 'hidden_by_moderator',
        updated_at = now()
    WHERE id = p_publication_id
    RETURNING * INTO v_pub;

  RETURN v_pub;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hide_publication(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hide_publication(uuid, text) TO authenticated;

-- =========================================================
-- 10. RPC: restore_publication (恢复)
-- =========================================================

CREATE OR REPLACE FUNCTION public.restore_publication(
  p_publication_id uuid,
  p_reason text default null
) RETURNS public.storyflow_publications
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pub public.storyflow_publications;
BEGIN
  SELECT * INTO v_pub
    FROM public.storyflow_publications
    WHERE id = p_publication_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  UPDATE public.storyflow_publications
    SET visibility = 'public',
        status = 'active',
        updated_at = now()
    WHERE id = p_publication_id
    RETURNING * INTO v_pub;

  RETURN v_pub;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restore_publication(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_publication(uuid, text) TO authenticated;

COMMIT;

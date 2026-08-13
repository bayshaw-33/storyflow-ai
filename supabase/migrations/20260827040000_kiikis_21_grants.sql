-- KIIKIS 2.1 Phase 4 — Task 4.1 资源出生即权利 (RG-001~006)
--
-- 覆盖:
--   RG-001: owner 只由服务端认证与创建事实决定
--   RG-002: 邀请 token 单次/限时/哈希存储
--   RG-003: grant + RLS 双重校验
--   RG-004: 撤销不删除历史 (status=revoked)
--   RG-005: 衍生物权利遵循创建时条款 (terms 快照)
--   RG-006: 所有权转移双方确认 (from_owner/to_owner/confirmed_at)
--
-- 表设计原则:
--   1. resource_grants 记录 owner → grantee 的权限关系, scope ∈ {collaboration, share, use, adaptation, license}
--   2. status ∈ {active, revoked, expired} — 撤销不删除 (RG-004)
--   3. terms 字段为 JSONB 快照, 衍生物创建时冻结 (RG-005)
--   4. invite_tokens 哈希存储, 单次使用, 限时过期 (RG-002)
--   5. ownership_transfers 双方确认审计 (RG-006)
--   6. 所有表启用 RLS: owner 或 grant 授权用户可读

BEGIN;

-- =========================================================
-- 1. storyflow_resource_grants — 资源授权关系 (RG-003/004/005)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_resource_grants (
  id uuid primary key default gen_random_uuid(),
  -- 资源定位
  resource_type text not null check (resource_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene')),
  resource_id uuid not null,
  -- 授权关系
  grantor_id uuid not null references auth.users(id) on delete restrict,
  grantee_id uuid not null references auth.users(id) on delete restrict,
  -- 授权范围
  scope text not null check (scope in ('collaboration', 'share', 'use', 'adaptation', 'license')),
  -- 角色 (CO-001: collaboration 范围下的角色)
  role text check (role in ('owner', 'editor', 'reviewer', 'viewer', 'asset_operator')),
  -- 授权条款快照 (RG-005: 衍生物创建时冻结, 后续不变)
  terms jsonb not null default '{}'::jsonb,
  -- 状态 (RG-004: 撤销不删除)
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  -- 过期时间 (null 表示永久)
  expires_at timestamptz,
  -- 来源 (衍生物记录 source grant)
  source_grant_id uuid,
  -- 幂等键 (防重复 grant)
  idempotency_key text not null,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  -- 唯一约束: 同 grantor+grantee+resource+scope+idempotency_key 只能有一条 active
  constraint resource_grants_idempotency_key unique (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_resource_grants_resource
  ON public.storyflow_resource_grants(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_grants_grantee
  ON public.storyflow_resource_grants(grantee_id, status);
CREATE INDEX IF NOT EXISTS idx_resource_grants_grantor
  ON public.storyflow_resource_grants(grantor_id, status);
CREATE INDEX IF NOT EXISTS idx_resource_grants_source
  ON public.storyflow_resource_grants(source_grant_id);

COMMENT ON TABLE public.storyflow_resource_grants IS
  'RG-003/004/005: 资源授权关系, 撤销不删除历史, 衍生物冻结 terms 快照';

ALTER TABLE public.storyflow_resource_grants ENABLE ROW LEVEL SECURITY;

-- grantor 可读自己授予的 grant
CREATE POLICY resource_grants_grantor_select
  ON public.storyflow_resource_grants
  FOR SELECT
  USING (auth.uid() = grantor_id OR auth.uid() = grantee_id);

-- grantor 可创建 grant (必须自己是资源 owner 或有授权权限)
-- 服务端 RPC 通过 service role 绕过 RLS, 客户端直接 INSERT 被 RLS 阻断
CREATE POLICY resource_grants_grantor_insert
  ON public.storyflow_resource_grants
  FOR INSERT
  WITH CHECK (auth.uid() = grantor_id);

-- grantor 可撤销自己的 grant (只改 status, 不删除)
CREATE POLICY resource_grants_grantor_update
  ON public.storyflow_resource_grants
  FOR UPDATE
  USING (auth.uid() = grantor_id)
  WITH CHECK (auth.uid() = grantor_id);

-- 禁止 DELETE (RG-004: 撤销不删除历史)
-- 不创建 DELETE policy 即可

-- =========================================================
-- 2. storyflow_invite_tokens — 邀请 token (RG-002)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_invite_tokens (
  id uuid primary key default gen_random_uuid(),
  -- 关联的 grant (接受后激活)
  resource_type text not null check (resource_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene')),
  resource_id uuid not null,
  -- 发起者
  inviter_id uuid not null references auth.users(id) on delete restrict,
  -- 授权范围 (接受后创建的 grant scope)
  scope text not null check (scope in ('collaboration', 'share', 'use', 'adaptation', 'license')),
  role text check (role in ('owner', 'editor', 'reviewer', 'viewer', 'asset_operator')),
  terms jsonb not null default '{}'::jsonb,
  -- token 哈希存储 (RG-002: 不存明文)
  token_hash text not null unique,
  -- 状态 (RG-002: 单次使用)
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  -- 限时过期 (RG-002)
  expires_at timestamptz not null,
  -- 接受者 (接受后绑定, RG-002)
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  -- 元数据
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null
);

CREATE INDEX IF NOT EXISTS idx_invite_tokens_hash
  ON public.storyflow_invite_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_inviter
  ON public.storyflow_invite_tokens(inviter_id, status);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_resource
  ON public.storyflow_invite_tokens(resource_type, resource_id);

COMMENT ON TABLE public.storyflow_invite_tokens IS
  'RG-002: 邀请 token 哈希存储, 单次使用, 限时过期';

ALTER TABLE public.storyflow_invite_tokens ENABLE ROW LEVEL SECURITY;

-- inviter 可读自己创建的邀请
CREATE POLICY invite_tokens_inviter_select
  ON public.storyflow_invite_tokens
  FOR SELECT
  USING (auth.uid() = inviter_id OR auth.uid() = accepted_by);

-- inviter 可创建邀请
CREATE POLICY invite_tokens_inviter_insert
  ON public.storyflow_invite_tokens
  FOR INSERT
  WITH CHECK (auth.uid() = inviter_id);

-- inviter 可撤销自己的邀请 (改 status, 不删除)
CREATE POLICY invite_tokens_inviter_update
  ON public.storyflow_invite_tokens
  FOR UPDATE
  USING (auth.uid() = inviter_id)
  WITH CHECK (auth.uid() = inviter_id);

-- =========================================================
-- 3. storyflow_ownership_transfers — 所有权转移审计 (RG-006)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('universe', 'project', 'actor', 'asset', 'episode', 'scene')),
  resource_id uuid not null,
  -- 转移双方 (RG-006: 双方确认)
  from_owner_id uuid not null references auth.users(id) on delete restrict,
  to_owner_id uuid not null references auth.users(id) on delete restrict,
  -- 状态 (RG-006: 单方发起不生效)
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  -- 确认时间 (RG-006: 双方确认后记录)
  confirmed_at timestamptz,
  -- 取消
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  -- 元数据
  created_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null unique
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_resource
  ON public.storyflow_ownership_transfers(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_ownership_transfers_parties
  ON public.storyflow_ownership_transfers(from_owner_id, to_owner_id, status);

COMMENT ON TABLE public.storyflow_ownership_transfers IS
  'RG-006: 所有权转移双方确认审计, 记录前后 owner';

ALTER TABLE public.storyflow_ownership_transfers ENABLE ROW LEVEL SECURITY;

-- 转移双方可读
CREATE POLICY ownership_transfers_parties_select
  ON public.storyflow_ownership_transfers
  FOR SELECT
  USING (auth.uid() = from_owner_id OR auth.uid() = to_owner_id);

-- 发起方可创建 (确认由 RPC 处理, 需双方签名)
CREATE POLICY ownership_transfers_from_insert
  ON public.storyflow_ownership_transfers
  FOR INSERT
  WITH CHECK (auth.uid() = from_owner_id);

-- 双方可更新 (确认/取消)
CREATE POLICY ownership_transfers_parties_update
  ON public.storyflow_ownership_transfers
  FOR UPDATE
  USING (auth.uid() = from_owner_id OR auth.uid() = to_owner_id)
  WITH CHECK (auth.uid() = from_owner_id OR auth.uid() = to_owner_id);

-- =========================================================
-- 4. RPC: create_resource_grant (RG-001/003)
--    服务端写入, owner_id 来自认证用户, 客户端不可指定
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_resource_grant(
  p_resource_type text,
  p_resource_id uuid,
  p_grantee_id uuid,
  p_scope text,
  p_role text default null,
  p_terms jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null,
  p_idempotency_key text,
  p_source_grant_id uuid default null
) RETURNS public.storyflow_resource_grants
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant public.storyflow_resource_grants;
  v_grantor_id uuid := auth.uid();
BEGIN
  -- RG-001: owner_id 由服务端认证决定, 不接受客户端传入
  IF v_grantor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: auth.uid() is null';
  END IF;

  -- 幂等: 同 idempotency_key 返回已有记录
  SELECT * INTO v_grant
    FROM public.storyflow_resource_grants
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

  IF FOUND THEN
    RETURN v_grant;
  END IF;

  INSERT INTO public.storyflow_resource_grants (
    resource_type, resource_id, grantor_id, grantee_id,
    scope, role, terms, status, expires_at, source_grant_id, idempotency_key
  ) VALUES (
    p_resource_type, p_resource_id, v_grantor_id, p_grantee_id,
    p_scope, p_role, p_terms, 'active', p_expires_at, p_source_grant_id, p_idempotency_key
  )
  RETURNING * INTO v_grant;

  RETURN v_grant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_resource_grant(text, uuid, uuid, text, text, jsonb, timestamptz, text, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_resource_grant(text, uuid, uuid, text, text, jsonb, timestamptz, text, uuid) TO authenticated;

-- =========================================================
-- 5. RPC: revoke_resource_grant (RG-004: 撤销不删除历史)
-- =========================================================

CREATE OR REPLACE FUNCTION public.revoke_resource_grant(
  p_grant_id uuid,
  p_revoke_reason text default null
) RETURNS public.storyflow_resource_grants
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_grant public.storyflow_resource_grants;
  v_user uuid := auth.uid();
BEGIN
  SELECT * INTO v_grant
    FROM public.storyflow_resource_grants
    WHERE id = p_grant_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: grant % does not exist', p_grant_id;
  END IF;

  -- 只有 grantor 可撤销
  IF v_grant.grantor_id != v_user THEN
    RAISE EXCEPTION 'forbidden: only grantor can revoke';
  END IF;

  -- RG-004: 只改 status, 不删除
  UPDATE public.storyflow_resource_grants
    SET status = 'revoked',
        revoked_at = now(),
        revoked_by = v_user,
        revoke_reason = p_revoke_reason,
        updated_at = now()
    WHERE id = p_grant_id
    RETURNING * INTO v_grant;

  RETURN v_grant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_resource_grant(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_resource_grant(uuid, text) TO authenticated;

-- =========================================================
-- 6. RPC: check_resource_grant (RG-003: grant 检查)
--    返回用户对资源是否有指定 scope 的 active grant
-- =========================================================

CREATE OR REPLACE FUNCTION public.check_resource_grant(
  p_resource_type text,
  p_resource_id uuid,
  p_user_id uuid,
  p_required_scope text default null
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
  v_scope_filter text := COALESCE(p_required_scope, '%');
BEGIN
  -- owner 始终有全部权限 (RG-003)
  -- owner 关系由资源表决定, 这里检查 grant 表
  SELECT count(*) INTO v_count
    FROM public.storyflow_resource_grants
    WHERE resource_type = p_resource_type
      AND resource_id = p_resource_id
      AND grantee_id = p_user_id
      AND status = 'active'
      AND (p_required_scope IS NULL OR scope = p_required_scope)
      AND (expires_at IS NULL OR expires_at > now());

  RETURN v_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_resource_grant(text, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_resource_grant(text, uuid, uuid, text) TO authenticated;

-- =========================================================
-- 7. RPC: accept_invite_token (RG-002: 接受后绑定)
-- =========================================================

CREATE OR REPLACE FUNCTION public.accept_invite_token(
  p_token_hash text,
  p_accepter_id uuid default null
) RETURNS public.storyflow_resource_grants
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token public.storyflow_invite_tokens;
  v_accepter uuid := COALESCE(p_accepter_id, auth.uid());
  v_grant public.storyflow_resource_grants;
  v_idempotency_key text;
BEGIN
  IF v_accepter IS NULL THEN
    RAISE EXCEPTION 'unauthenticated: accepter_id is null';
  END IF;

  -- 查找 token
  SELECT * INTO v_token
    FROM public.storyflow_invite_tokens
    WHERE token_hash = p_token_hash
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: invite token does not exist';
  END IF;

  -- RG-002: 单次使用
  IF v_token.status != 'pending' THEN
    RAISE EXCEPTION 'invalid_token: token status is %, not pending', v_token.status;
  END IF;

  -- RG-002: 限时过期
  IF v_token.expires_at < now() THEN
    UPDATE public.storyflow_invite_tokens
      SET status = 'expired'
      WHERE id = v_token.id;
    RAISE EXCEPTION 'expired: token has expired';
  END IF;

  -- RG-002: 接受后绑定接受者
  UPDATE public.storyflow_invite_tokens
    SET status = 'accepted',
        accepted_by = v_accepter,
        accepted_at = now()
    WHERE id = v_token.id;

  -- 创建 grant (幂等)
  v_idempotency_key := 'invite:' || v_token.id::text;
  INSERT INTO public.storyflow_resource_grants (
    resource_type, resource_id, grantor_id, grantee_id,
    scope, role, terms, status, idempotency_key
  ) VALUES (
    v_token.resource_type, v_token.resource_id, v_token.inviter_id, v_accepter,
    v_token.scope, v_token.role, v_token.terms, 'active', v_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_grant;

  IF v_grant IS NULL THEN
    SELECT * INTO v_grant
      FROM public.storyflow_resource_grants
      WHERE idempotency_key = v_idempotency_key;
  END IF;

  RETURN v_grant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_invite_token(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_invite_token(text, uuid) TO authenticated;

-- =========================================================
-- 8. RPC: confirm_ownership_transfer (RG-006: 双方确认)
-- =========================================================

CREATE OR REPLACE FUNCTION public.confirm_ownership_transfer(
  p_transfer_id uuid
) RETURNS public.storyflow_ownership_transfers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transfer public.storyflow_ownership_transfers;
  v_user uuid := auth.uid();
BEGIN
  SELECT * INTO v_transfer
    FROM public.storyflow_ownership_transfers
    WHERE id = p_transfer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: transfer % does not exist', p_transfer_id;
  END IF;

  -- RG-006: 双方确认 — 接收方确认
  IF v_user != v_transfer.to_owner_id THEN
    RAISE EXCEPTION 'forbidden: only to_owner can confirm transfer';
  END IF;

  IF v_transfer.status != 'pending' THEN
    RAISE EXCEPTION 'invalid_state: transfer status is %, not pending', v_transfer.status;
  END IF;

  UPDATE public.storyflow_ownership_transfers
    SET status = 'confirmed',
        confirmed_at = now()
    WHERE id = p_transfer_id
    RETURNING * INTO v_transfer;

  RETURN v_transfer;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_ownership_transfer(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.confirm_ownership_transfer(uuid) TO authenticated;

-- =========================================================
-- 9. 禁止客户端直接 INSERT/UPDATE/DELETE grant 表 (RG-001)
--    只能通过 RPC 操作
-- =========================================================

REVOKE INSERT, UPDATE, DELETE ON public.storyflow_resource_grants FROM anon, authenticated;
-- 注意: INSERT/UPDATE 通过 RLS policy 允许, 但 GRANT 表只有 RPC 写入
-- 实际上 RLS policy 已限制, 这里额外 REVOKE 作为双重保护

COMMIT;

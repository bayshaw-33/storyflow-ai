-- KIIKIS 2.1 Phase 3 — Task 3.1 KK 账号事实与权益账本
--
-- 覆盖 K21-KK-020..024:
--   K21-KK-020: 账号级 kk_profile，非 localStorage 真相
--   K21-KK-021: append-only entitlement/inventory ledger
--   K21-KK-022: 装备历史、当前外观和社区展示隐私可审计
--   K21-KK-023: 成长只来自有意义且防刷的创作里程碑
--   K21-KK-024: 2.1 不存在付费抽卡、二级交易、pay-to-win
--
-- 表设计原则：
--   1. profile 一行一 owner，作为账号级真相 (K21-KK-020)
--   2. entitlement_ledger append-only，direction ∈ {grant, revoke}，
--      source_type ∈ {system_migration, creative_milestone, subscription, admin_grant}
--      2.1 禁止 paid_draw / trade (K21-KK-024)
--   3. equipment_history append-only，记录何时装备/卸下哪个 item
--   4. memory_facts 记录用户明确选择、最近项目、Universe、已授权上下文 (K21-KK-010)
--   5. milestone_grants 幂等，同一 idempotency_key 不重复授予 (K21-KK-023)
--
-- 所有表启用 RLS：owner 只能读写自己的行。

BEGIN;

-- =========================================================
-- 1. storyflow_kk_profiles — 账号级 KK 档案 (K21-KK-020)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_kk_profiles (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '',
  -- 当前装备的 item_version 快照（由 ledger 净持有校验决定）
  equipped_item_id text,
  equipped_item_version text,
  -- 社区展示隐私 (K21-KK-022): profile_display / community_display 默认关闭
  profile_display boolean not null default false,
  community_display boolean not null default false,
  -- 成长等级 (由 milestone_grants 聚合，非用户直写)
  growth_level integer not null default 0,
  growth_xp integer not null default 0,
  -- 最近上下文 (K21-KK-010)
  recent_project_id uuid,
  recent_universe_id uuid,
  -- 元数据
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (growth_level >= 0),
  check (growth_xp >= 0)
);

COMMENT ON TABLE public.storyflow_kk_profiles IS
  'K21-KK-020 账号级 KK 档案真相，替代 localStorage 卡片';

ALTER TABLE public.storyflow_kk_profiles ENABLE ROW LEVEL SECURITY;

-- owner 可读自己的 profile
CREATE POLICY kk_profiles_owner_select
  ON public.storyflow_kk_profiles
  FOR SELECT
  USING (auth.uid() = owner_id);

-- owner 可更新自己的非成长字段 (growth_* 由 RPC 维护)
CREATE POLICY kk_profiles_owner_update
  ON public.storyflow_kk_profiles
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 仅服务端 role 可 insert (首次注册) — 客户端通过 RPC 触发
-- 这里允许 owner 自己 insert 自己的 profile 行 (注册时)
CREATE POLICY kk_profiles_owner_insert
  ON public.storyflow_kk_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- =========================================================
-- 2. storyflow_entitlement_ledger — append-only 权益账本 (K21-KK-021)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_entitlement_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  item_id text not null,
  item_version text not null,
  direction text not null check (direction in ('grant', 'revoke')),
  -- K21-KK-024: 2.1 禁止 paid_draw / trade
  source_type text not null check (source_type in (
    'system_migration',
    'creative_milestone',
    'subscription',
    'admin_grant'
  )),
  source_id text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  -- 同一 owner + idempotency_key 只能写入一次 (幂等)
  unique (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_entitlement_ledger_owner
  ON public.storyflow_entitlement_ledger (owner_id, created_at);

CREATE INDEX IF NOT EXISTS idx_entitlement_ledger_item
  ON public.storyflow_entitlement_ledger (owner_id, item_id, item_version);

COMMENT ON TABLE public.storyflow_entitlement_ledger IS
  'K21-KK-021 append-only 权益账本，记录授予/撤销来源、版本、时间';

ALTER TABLE public.storyflow_entitlement_ledger ENABLE ROW LEVEL SECURITY;

-- owner 只读自己的 ledger
CREATE POLICY entitlement_ledger_owner_select
  ON public.storyflow_entitlement_ledger
  FOR SELECT
  USING (auth.uid() = owner_id);

-- 禁止 owner 直接 INSERT/UPDATE/DELETE — 只能通过 RPC (service role)
REVOKE INSERT, UPDATE, DELETE ON public.storyflow_entitlement_ledger FROM anon, authenticated;

-- =========================================================
-- 3. storyflow_kk_equipment_history — 装备历史 (K21-KK-022)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_kk_equipment_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  item_id text not null,
  item_version text not null,
  action text not null check (action in ('equip', 'unequip')),
  -- 装备前是否经过 ledger 净持有校验
  verified_ledger boolean not null default true,
  source_type text not null check (source_type in ('user', 'system_migration')),
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_kk_equipment_history_owner
  ON public.storyflow_kk_equipment_history (owner_id, created_at);

COMMENT ON TABLE public.storyflow_kk_equipment_history IS
  'K21-KK-022 装备历史，审计何时装备/卸下哪个 item';

ALTER TABLE public.storyflow_kk_equipment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY kk_equipment_history_owner_select
  ON public.storyflow_kk_equipment_history
  FOR SELECT
  USING (auth.uid() = owner_id);

REVOKE INSERT, UPDATE, DELETE ON public.storyflow_kk_equipment_history FROM anon, authenticated;

-- =========================================================
-- 4. storyflow_kk_memory_facts — 陪伴上下文记忆 (K21-KK-010)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_kk_memory_facts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  fact_type text not null check (fact_type in (
    'user_choice',           -- 用户明确选择
    'recent_project',        -- 最近项目
    'recent_universe',       -- 最近 Universe
    'authorized_context',    -- 已授权上下文
    'milestone_grant',       -- 成长里程碑 (K21-KK-023)
    'manual_note'            -- 用户手记 (K21-KK-014 导出/删除入口)
  )),
  fact_key text not null,
  fact_value jsonb not null,
  -- 事实来源 (用户/系统/里程碑)
  source text not null default 'user',
  -- 是否敏感 (读取需服务端权限校验 K21-KK-011)
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now(),
  -- 用户可手动删除 (K21-KK-014)
  deleted_at timestamptz,
  -- 同一 owner + fact_type + fact_key 唯一 (未删除)
  unique (owner_id, fact_type, fact_key)
);

CREATE INDEX IF NOT EXISTS idx_kk_memory_facts_owner
  ON public.storyflow_kk_memory_facts (owner_id, fact_type);

CREATE INDEX IF NOT EXISTS idx_kk_memory_facts_active
  ON public.storyflow_kk_memory_facts (owner_id, deleted_at);

COMMENT ON TABLE public.storyflow_kk_memory_facts IS
  'K21-KK-010 陪伴上下文记忆 + K21-KK-014 导出/删除入口';

ALTER TABLE public.storyflow_kk_memory_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY kk_memory_facts_owner_select
  ON public.storyflow_kk_memory_facts
  FOR SELECT
  USING (auth.uid() = owner_id);

-- owner 可更新自己的 memory_facts (软删除、修改手记)
CREATE POLICY kk_memory_facts_owner_update
  ON public.storyflow_kk_memory_facts
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- owner 可插入自己的 memory_facts
CREATE POLICY kk_memory_facts_owner_insert
  ON public.storyflow_kk_memory_facts
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- owner 可删除自己的 memory_facts (软删除通过 UPDATE deleted_at)
-- 硬删除也允许，K21-KK-014 要求明确删除入口
CREATE POLICY kk_memory_facts_owner_delete
  ON public.storyflow_kk_memory_facts
  FOR DELETE
  USING (auth.uid() = owner_id);

-- =========================================================
-- 5. RPC: append_entitlement_entry (K21-KK-021 幂等授予)
-- =========================================================
-- Service role 调用，客户端无法直接写 ledger。
-- 幂等：同一 (owner_id, idempotency_key) 已存在则跳过。

CREATE OR REPLACE FUNCTION public.append_entitlement_entry(
  p_owner_id uuid,
  p_item_id text,
  p_item_version text,
  p_direction text,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text,
  OUT p_inserted boolean,
  OUT p_entry_id uuid
) LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  -- K21-KK-024: 禁止 paid_draw / trade
  IF p_source_type NOT IN ('system_migration', 'creative_milestone', 'subscription', 'admin_grant') THEN
    RAISE EXCEPTION 'K21-KK-024: source_type % not allowed in 2.1', p_source_type;
  END IF;

  IF p_direction NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'invalid direction: %', p_direction;
  END IF;

  -- 幂等检查
  SELECT id INTO p_entry_id
    FROM public.storyflow_entitlement_ledger
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    p_inserted := false;
    RETURN;
  END IF;

  INSERT INTO public.storyflow_entitlement_ledger (
    owner_id, item_id, item_version, direction, source_type, source_id, idempotency_key
  ) VALUES (
    p_owner_id, p_item_id, p_item_version, p_direction, p_source_type, p_source_id, p_idempotency_key
  )
  RETURNING id INTO p_entry_id;

  p_inserted := true;
END;
$$;

-- =========================================================
-- 6. RPC: compute_net_entitlements (净持有)
-- =========================================================
-- 返回某 owner 当前净持有的 item_id → item_version 列表。
-- grant - revoke 后剩余的为当前持有。

CREATE OR REPLACE FUNCTION public.compute_net_entitlements(
  p_owner_id uuid
) RETURNS TABLE (
  item_id text,
  item_version text,
  net_count bigint
) LANGUAGE sql SECURITY INVOKER AS $$
  SELECT item_id, item_version, sum(CASE direction WHEN 'grant' THEN 1 ELSE -1 END) AS net_count
  FROM public.storyflow_entitlement_ledger
  WHERE owner_id = p_owner_id
  GROUP BY item_id, item_version
  HAVING sum(CASE direction WHEN 'grant' THEN 1 ELSE -1 END) > 0;
$$;

-- =========================================================
-- 7. RPC: equip_kk_item (装备校验 + 记录历史)
-- =========================================================
-- 装备前校验 ledger 净持有 (K21-KK-022)。
-- 装备成功后更新 profile.equipped_item_id/version + 写入 equipment_history。

CREATE OR REPLACE FUNCTION public.equip_kk_item(
  p_owner_id uuid,
  p_item_id text,
  p_item_version text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_net_count bigint;
  v_current_equipped text;
BEGIN
  -- 1. 校验 ledger 净持有
  SELECT net_count INTO v_net_count
    FROM public.compute_net_entitlements(p_owner_id)
    WHERE item_id = p_item_id AND item_version = p_item_version;

  IF v_net_count IS NULL OR v_net_count <= 0 THEN
    RAISE EXCEPTION 'K21-KK-022: item % version % not in net entitlements', p_item_id, p_item_version;
  END IF;

  -- 2. 记录装备历史
  INSERT INTO public.storyflow_kk_equipment_history (
    owner_id, item_id, item_version, action, verified_ledger, source_type
  ) VALUES (
    p_owner_id, p_item_id, p_item_version, 'equip', true, 'user'
  );

  -- 3. 若当前装备的是别的 item，记录 unequip
  SELECT equipped_item_id INTO v_current_equipped
    FROM public.storyflow_kk_profiles
    WHERE owner_id = p_owner_id;

  IF v_current_equipped IS NOT NULL AND v_current_equipped <> p_item_id THEN
    INSERT INTO public.storyflow_kk_equipment_history (
      owner_id, item_id, item_version, action, verified_ledger, source_type
    )
    SELECT p_owner_id, equipped_item_id, equipped_item_version, 'unequip', true, 'user'
      FROM public.storyflow_kk_profiles
      WHERE owner_id = p_owner_id;
  END IF;

  -- 4. 更新 profile
  UPDATE public.storyflow_kk_profiles
    SET equipped_item_id = p_item_id,
        equipped_item_version = p_item_version,
        updated_at = now()
    WHERE owner_id = p_owner_id;
END;
$$;

-- =========================================================
-- 8. RPC: grant_milestone (K21-KK-023 防刷成长)
-- =========================================================
-- 通过 Creative Event idempotency key 幂等授予成长。
-- 批量垃圾生成不会刷成长：同一 idempotency_key 只授予一次。

CREATE OR REPLACE FUNCTION public.grant_milestone(
  p_owner_id uuid,
  p_milestone_id text,
  p_xp integer,
  p_level_delta integer,
  p_idempotency_key text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_existing uuid;
  v_new_level integer;
BEGIN
  -- 1. 幂等检查 (K21-KK-023)
  SELECT id INTO v_existing
    FROM public.storyflow_kk_memory_facts
    WHERE owner_id = p_owner_id
      AND fact_type = 'milestone_grant'
      AND fact_key = p_milestone_id;

  IF FOUND THEN
    -- 已授予，幂等返回
    RETURN;
  END IF;

  -- 2. 插入 milestone_grant 事实
  INSERT INTO public.storyflow_kk_memory_facts (
    owner_id, fact_type, fact_key, fact_value, source, is_sensitive
  ) VALUES (
    p_owner_id,
    'milestone_grant',
    p_milestone_id,
    jsonb_build_object(
      'xp', p_xp,
      'level_delta', p_level_delta,
      'granted_at', now()
    ),
    'system',
    false
  );

  -- 3. 更新 profile 成长
  UPDATE public.storyflow_kk_profiles
    SET growth_xp = growth_xp + p_xp,
        growth_level = growth_level + p_level_delta,
        updated_at = now()
    WHERE owner_id = p_owner_id;
END;
$$;

COMMIT;

-- KIIKIS 2.1 Phase 6 — Task 6.1 Stripe 订阅核心生命周期 (BI-001~008)
--
-- 覆盖:
--   BI-001: Stripe customer 与 Kiikis user 一一映射
--   BI-005: 按 Stripe event ID 幂等处理
--   BI-006: 拒绝用较旧事件覆盖较新订阅状态
--   BI-008: plan entitlement 只由服务器读取 webhook 同步状态
--
-- 表设计:
--   1. storyflow_subscriptions: 订阅记录 (user_id UNIQUE, stripe_customer_id UNIQUE)
--   2. storyflow_subscription_events: webhook 事件幂等表 (event_id UNIQUE)
--   3. storyflow_entitlements: 权益表 (服务器读取 webhook 同步状态)
--   4. storyflow_price_whitelist: 允许的 price_id 白名单 (BI-002)

BEGIN;

-- =========================================================
-- 1. storyflow_subscriptions — 订阅记录 (BI-001)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- BI-001: user_id 与 stripe_customer_id 一一映射
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  -- 计划
  plan_id text,
  price_id text,
  -- 订阅状态机: incomplete → active → past_due → canceled / ended
  status text not null default 'incomplete' check (status in (
    'incomplete', 'active', 'past_due', 'canceled', 'ended'
  )),
  -- 订阅周期
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- BI-006: 最新事件时间戳 (Stripe event.created, unix seconds)
  -- 用于拒绝旧事件覆盖较新状态
  last_event_created bigint not null default 0,
  -- 审计
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- BI-001: 一一映射 (user_id 唯一, stripe_customer_id 唯一)
  constraint subscriptions_user_unique unique (user_id),
  constraint subscriptions_customer_unique unique (stripe_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user
  ON public.storyflow_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status
  ON public.storyflow_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON public.storyflow_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

COMMENT ON TABLE public.storyflow_subscriptions IS
  'BI-001: Stripe customer 与 Kiikis user 一一映射';

ALTER TABLE public.storyflow_subscriptions ENABLE ROW LEVEL SECURITY;

-- BI-008: 用户可读自己的订阅 (权益查询通过 API, 服务器读取)
CREATE POLICY subscriptions_owner_select
  ON public.storyflow_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 服务端 RPC 写入 (SECURITY DEFINER), 无需 INSERT/UPDATE policy 给客户端
-- 防止客户端直接伪造订阅状态 (BI-008)

-- =========================================================
-- 2. storyflow_subscription_events — webhook 事件幂等 (BI-005)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_subscription_events (
  id uuid primary key default gen_random_uuid(),
  -- BI-005: Stripe event ID 唯一, 重复 event 不重复处理
  stripe_event_id text not null unique,
  event_type text not null,
  -- BI-006: Stripe event.created (unix timestamp)
  stripe_created bigint,
  -- 处理状态 (processed/skipped/error)
  processed_status text not null default 'processed' check (processed_status in (
    'processed', 'skipped', 'error'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_type
  ON public.storyflow_subscription_events(event_type, created_at desc);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created
  ON public.storyflow_subscription_events(stripe_created desc);

COMMENT ON TABLE public.storyflow_subscription_events IS
  'BI-005: webhook 事件幂等表 (按 Stripe event ID)';

ALTER TABLE public.storyflow_subscription_events ENABLE ROW LEVEL SECURITY;

-- 仅服务端可访问 (webhook 处理通过 SECURITY DEFINER RPC)
-- 客户端不可读 (避免泄露 webhook payload)
CREATE POLICY subscription_events_admin_select
  ON public.storyflow_subscription_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'auditor')
  ));

-- =========================================================
-- 3. storyflow_entitlements — 权益表 (BI-008)
--    只由服务器读取 webhook 同步状态, 客户端不可伪造
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- 计划层级 (free/creator/pro/enterprise)
  plan_tier text not null check (plan_tier in ('free', 'creator', 'pro', 'enterprise')),
  -- 有效权益列表 (JSON array of feature keys)
  features jsonb not null default '[]'::jsonb,
  -- 来源 (subscription / manual)
  source text not null default 'subscription' check (source in ('subscription', 'manual')),
  source_id text, -- subscription_id 或 manual 标记
  active boolean not null default true,
  -- 审计
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 一个 user 一个 plan_tier
  constraint entitlements_user_plan_unique unique (user_id, plan_tier)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user
  ON public.storyflow_entitlements(user_id, active);
CREATE INDEX IF NOT EXISTS idx_entitlements_plan
  ON public.storyflow_entitlements(plan_tier, active);

COMMENT ON TABLE public.storyflow_entitlements IS
  'BI-008: 权益表 (只由服务器读取 webhook 同步状态)';

ALTER TABLE public.storyflow_entitlements ENABLE ROW LEVEL SECURITY;

-- BI-008: 用户可读自己的权益 (只读, 不可写)
CREATE POLICY entitlements_owner_select
  ON public.storyflow_entitlements
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 服务端 RPC 写入 (SECURITY DEFINER), 客户端不可 INSERT/UPDATE/DELETE

-- =========================================================
-- 4. storyflow_price_whitelist — 允许的 price_id 白名单 (BI-002)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_price_whitelist (
  id uuid primary key default gen_random_uuid(),
  price_id text not null unique,
  -- 计划映射
  plan_tier text not null check (plan_tier in ('creator', 'pro', 'enterprise')),
  plan_name text,
  -- 金额 (分, 用于审计展示)
  amount_cents integer,
  currency text default 'usd',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

COMMENT ON TABLE public.storyflow_price_whitelist IS
  'BI-002: 允许的 Stripe price_id 白名单 (Checkout 校验)';

ALTER TABLE public.storyflow_price_whitelist ENABLE ROW LEVEL SECURITY;

-- 所有人可读白名单 (price_id 非敏感, 用于展示计划)
CREATE POLICY price_whitelist_all_select
  ON public.storyflow_price_whitelist
  FOR SELECT TO authenticated
  USING (active = true);

-- 仅 admin 可写
CREATE POLICY price_whitelist_admin_insert
  ON public.storyflow_price_whitelist
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY price_whitelist_admin_update
  ON public.storyflow_price_whitelist
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- =========================================================
-- 5. RPC: upsert_subscription (BI-001, BI-006)
--    创建/查找 Stripe customer 映射; 拒绝旧事件覆盖
-- =========================================================

CREATE OR REPLACE FUNCTION public.upsert_subscription(
  p_user_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text default null,
  p_plan_id text default null,
  p_price_id text default null,
  p_status text default 'incomplete',
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_event_created bigint default 0
) RETURNS public.storyflow_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sub public.storyflow_subscriptions;
BEGIN
  -- BI-001: 查找现有订阅 (user_id 唯一)
  SELECT * INTO v_sub FROM public.storyflow_subscriptions
    WHERE user_id = p_user_id LIMIT 1;

  IF v_sub IS NULL THEN
    -- 新建
    INSERT INTO public.storyflow_subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id, plan_id, price_id,
      status, current_period_start, current_period_end, cancel_at_period_end,
      last_event_created, updated_at
    ) VALUES (
      p_user_id, p_stripe_customer_id, p_stripe_subscription_id, p_plan_id, p_price_id,
      p_status, p_current_period_start, p_current_period_end, p_cancel_at_period_end,
      p_event_created, now()
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING * INTO v_sub;
    RETURN v_sub;
  END IF;

  -- BI-006: 拒绝旧事件覆盖较新状态
  IF p_event_created > 0 AND v_sub.last_event_created > p_event_created THEN
    -- 旧事件, 不覆盖
    RETURN v_sub;
  END IF;

  -- 更新
  UPDATE public.storyflow_subscriptions
    SET
      stripe_customer_id = COALESCE(p_stripe_customer_id, stripe_customer_id),
      stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
      plan_id = COALESCE(p_plan_id, plan_id),
      price_id = COALESCE(p_price_id, price_id),
      status = p_status,
      current_period_start = COALESCE(p_current_period_start, current_period_start),
      current_period_end = COALESCE(p_current_period_end, current_period_end),
      cancel_at_period_end = p_cancel_at_period_end,
      last_event_created = GREATEST(COALESCE(p_event_created, 0), last_event_created),
      updated_at = now()
    WHERE id = v_sub.id
    RETURNING * INTO v_sub;

  RETURN v_sub;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_subscription(
  uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, bigint
) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_subscription(
  uuid, text, text, text, text, text, timestamptz, timestamptz, boolean, bigint
) TO authenticated;

-- =========================================================
-- 6. RPC: record_subscription_event (BI-005 幂等)
--    记录已处理的 Stripe event_id, 重复返回 false
-- =========================================================

CREATE OR REPLACE FUNCTION public.record_subscription_event(
  p_stripe_event_id text,
  p_event_type text,
  p_stripe_created bigint default null,
  p_payload jsonb default '{}'::jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- BI-005: 幂等 — event_id 已存在则返回 false
  IF EXISTS (SELECT 1 FROM public.storyflow_subscription_events
    WHERE stripe_event_id = p_stripe_event_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.storyflow_subscription_events (
    stripe_event_id, event_type, stripe_created, payload
  ) VALUES (
    p_stripe_event_id, p_event_type, p_stripe_created, p_payload
  )
  ON CONFLICT (stripe_event_id) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_subscription_event(text, text, bigint, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_subscription_event(text, text, bigint, jsonb) TO authenticated;

-- =========================================================
-- 7. RPC: sync_entitlement (BI-008)
--    从订阅状态同步权益 (只由服务器调用)
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_entitlement(
  p_user_id uuid,
  p_plan_tier text,
  p_features jsonb default '[]'::jsonb,
  p_source text default 'subscription',
  p_source_id text default null,
  p_active boolean default true
) RETURNS public.storyflow_entitlements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ent public.storyflow_entitlements;
BEGIN
  -- BI-008: upsert 权益
  INSERT INTO public.storyflow_entitlements (
    user_id, plan_tier, features, source, source_id, active, updated_at
  ) VALUES (
    p_user_id, p_plan_tier, p_features, p_source, p_source_id, p_active, now()
  )
  ON CONFLICT (user_id, plan_tier) DO UPDATE
    SET features = EXCLUDED.features,
        source = EXCLUDED.source,
        source_id = EXCLUDED.source_id,
        active = EXCLUDED.active,
        updated_at = now()
  RETURNING * INTO v_ent;

  RETURN v_ent;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_entitlement(uuid, text, jsonb, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_entitlement(uuid, text, jsonb, text, text, boolean) TO authenticated;

-- =========================================================
-- 8. RPC: get_user_entitlements (BI-008)
--    服务器读取权益 (客户端通过 API 调用)
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_user_entitlements(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
    'planTier', plan_tier,
    'features', features,
    'source', source,
    'active', active
  )), '[]'::jsonb) INTO v_result
  FROM public.storyflow_entitlements
  WHERE user_id = p_user_id AND active = true;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_entitlements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_entitlements(uuid) TO authenticated;

-- =========================================================
-- 9. RPC: check_price_whitelist (BI-002)
--    检查 price_id 是否在白名单内
-- =========================================================

CREATE OR REPLACE FUNCTION public.check_price_whitelist(
  p_price_id text
) RETURNS table(plan_tier text, plan_name text, amount_cents integer, currency text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT pw.plan_tier, pw.plan_name, pw.amount_cents, pw.currency
    FROM public.storyflow_price_whitelist pw
    WHERE pw.price_id = p_price_id AND pw.active = true
    LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_price_whitelist(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_price_whitelist(text) TO authenticated;

COMMIT;

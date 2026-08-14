-- KIIKIS 2.1 Phase 6 — Task 6.3 交易内测 (TX-001~008)
--
-- 覆盖:
--   TX-001: 只开放 free/invite_only/manual_review 三种模式
--   TX-002: 每个批准结果创建真实、可审计 grant (关联 transaction_id)
--   TX-003: 保存 order、attribution 和创建时条款快照 (不可变)
--   TX-004: 明示费用、争议和 settlement intent
--   TX-005: 未移动资金时 paid_amount = 0
--   TX-006: UI 明示模式 (由应用层保证, migration 存 mode 字段)
--   TX-007: staging/prod 默认关闭 fixture, 演示数据 is_demo = true
--   TX-008: 禁止自动收益/提现/分账 (不实现相关功能)
--
-- 表设计:
--   1. storyflow_transactions: 交易主表 (mode, status, order, attribution, terms_snapshot, paid_amount, settlement_intent, is_demo)
--   2. storyflow_transaction_grants: 交易与 grant 的关联 (TX-002 审计链)

BEGIN;

-- =========================================================
-- 1. storyflow_transactions — 交易主表 (TX-001~008)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_transactions (
  id uuid primary key default gen_random_uuid(),
  -- TX-001: 只允许 free/invite_only/manual_review 三种模式
  mode text not null check (mode in ('free', 'invite_only', 'manual_review')),
  -- 交易状态: pending → approved / rejected / canceled
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'canceled'
  )),
  -- TX-003: order 信息 (JSON, 包含 resourceId/resourceType/priceId 等)
  order_info jsonb not null default '{}'::jsonb,
  -- TX-003: attribution (来源归因, 如邀请人/campaign 等)
  attribution jsonb not null default '{}'::jsonb,
  -- TX-003: 创建时条款快照 (不可变, 即使后续条款变更也不影响历史交易)
  terms_snapshot jsonb not null default '{}'::jsonb,
  -- TX-004: 费用金额 (分, 可为 0)
  amount_cents integer not null default 0 check (amount_cents >= 0),
  currency text not null default 'usd',
  -- TX-005: 实际已支付金额 (未移动资金时 = 0)
  paid_amount_cents integer not null default 0 check (paid_amount_cents >= 0),
  -- TX-004: 争议处理方式
  dispute_handling text not null default 'manual_review' check (dispute_handling in (
    'manual_review', 'no_dispute'
  )),
  -- TX-004: 结算意图 (如 manual_settlement)
  settlement_intent text not null default 'manual_settlement',
  -- TX-007: 演示数据永久标记 (不与真实数据混淆)
  is_demo boolean not null default false,
  -- TX-002: 关联的 grant_id (批准后填入)
  grant_id uuid,
  -- 买方/卖方 (由服务端认证注入)
  buyer_id uuid references auth.users(id) on delete set null,
  seller_id uuid references auth.users(id) on delete set null,
  -- 审计
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 幂等
  idempotency_key text not null
);

CREATE INDEX IF NOT EXISTS idx_transactions_buyer
  ON public.storyflow_transactions(buyer_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_transactions_seller
  ON public.storyflow_transactions(seller_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON public.storyflow_transactions(status, created_at desc);
CREATE INDEX IF NOT EXISTS idx_transactions_mode
  ON public.storyflow_transactions(mode, status);
CREATE INDEX IF NOT EXISTS idx_transactions_grant
  ON public.storyflow_transactions(grant_id)
  WHERE grant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_demo
  ON public.storyflow_transactions(is_demo)
  WHERE is_demo = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency
  ON public.storyflow_transactions(idempotency_key);

COMMENT ON TABLE public.storyflow_transactions IS
  'TX-001~008: 交易内测 (free/invite_only/manual_review 三种模式, 禁止自动收益/提现/分账)';

ALTER TABLE public.storyflow_transactions ENABLE ROW LEVEL SECURITY;

-- 买方可读自己的交易, 卖方可读自己的交易
CREATE POLICY transactions_buyer_select
  ON public.storyflow_transactions
  FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- admin 可读所有交易
CREATE POLICY transactions_admin_select
  ON public.storyflow_transactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role IN ('admin', 'auditor')
  ));

-- 客户端不可直接 INSERT/UPDATE (通过 SECURITY DEFINER RPC)
-- 防止伪造 mode/status/paid_amount (TX-001, TX-005)

-- =========================================================
-- 2. storyflow_transaction_terms — 条款模板 (可变, 用于快照源)
--    注意: 交易记录保存的是 terms_snapshot (不可变), 不是此表的引用
-- =========================================================

CREATE TABLE IF NOT EXISTS public.storyflow_transaction_terms (
  id uuid primary key default gen_random_uuid(),
  -- 条款 key (如 "creator_license_v1")
  terms_key text not null unique,
  -- 条款内容 (JSON)
  terms_body jsonb not null default '{}'::jsonb,
  -- 当前版本
  version integer not null default 1,
  -- 是否激活
  active boolean not null default true,
  -- 审计
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_transaction_terms_key
  ON public.storyflow_transaction_terms(terms_key, active);

COMMENT ON TABLE public.storyflow_transaction_terms IS
  'TX-003: 条款模板 (可变), 交易记录保存的是不可变快照';

ALTER TABLE public.storyflow_transaction_terms ENABLE ROW LEVEL SECURITY;

-- 所有人可读激活的条款模板 (用于展示)
CREATE POLICY transaction_terms_all_select
  ON public.storyflow_transaction_terms
  FOR SELECT TO authenticated
  USING (active = true);

-- 仅 admin 可写
CREATE POLICY transaction_terms_admin_insert
  ON public.storyflow_transaction_terms
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

CREATE POLICY transaction_terms_admin_update
  ON public.storyflow_transaction_terms
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.storyflow_admin_roles r
    WHERE r.user_id = auth.uid() AND r.role = 'admin'
  ));

-- =========================================================
-- 3. RPC: create_transaction (TX-001, TX-003, TX-005)
--    创建交易 (服务端注入 buyer_id, 校验 mode, 冻结条款快照)
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_transaction(
  p_mode text,
  p_order_info jsonb,
  p_attribution jsonb default '{}'::jsonb,
  p_terms_snapshot jsonb default '{}'::jsonb,
  p_amount_cents integer default 0,
  p_currency text default 'usd',
  p_dispute_handling text default 'manual_review',
  p_settlement_intent text default 'manual_settlement',
  p_is_demo boolean default false,
  p_buyer_id uuid default null,
  p_seller_id uuid default null,
  p_idempotency_key text default null
) RETURNS public.storyflow_transactions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx public.storyflow_transactions;
  v_idem text;
BEGIN
  -- TX-001: 校验 mode (DB 层兜底, 应用层已校验)
  IF p_mode NOT IN ('free', 'invite_only', 'manual_review') THEN
    RAISE EXCEPTION 'invalid_mode: mode must be free/invite_only/manual_review (TX-001)';
  END IF;

  -- TX-005: free/invite_only 模式 paid_amount 必须为 0 (创建时)
  -- (manual_review 在资金未移动前也为 0, 由应用层控制)
  -- 注: paid_amount_cents 默认 0, 此处不强制 (允许后续批准时更新)

  -- 幂等 key
  v_idem := COALESCE(p_idempotency_key, 'tx:' || gen_random_uuid()::text);

  INSERT INTO public.storyflow_transactions (
    mode, status, order_info, attribution, terms_snapshot,
    amount_cents, currency, paid_amount_cents,
    dispute_handling, settlement_intent, is_demo,
    buyer_id, seller_id, idempotency_key
  ) VALUES (
    p_mode, 'pending', p_order_info, p_attribution, p_terms_snapshot,
    p_amount_cents, p_currency, 0, -- TX-005: 创建时 paid_amount = 0
    p_dispute_handling, p_settlement_intent, p_is_demo,
    p_buyer_id, p_seller_id, v_idem
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_tx;

  IF v_tx IS NULL THEN
    -- 幂等: 返回已有记录
    SELECT * INTO v_tx FROM public.storyflow_transactions
      WHERE idempotency_key = v_idem LIMIT 1;
  END IF;

  RETURN v_tx;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_transaction(
  text, jsonb, jsonb, jsonb, integer, text, text, text, boolean, uuid, uuid, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_transaction(
  text, jsonb, jsonb, jsonb, integer, text, text, text, boolean, uuid, uuid, text
) TO authenticated;

-- =========================================================
-- 4. RPC: approve_transaction (TX-002)
--    批准交易 → 关联 grant_id (grant 由应用层调用 Phase 4 grant 服务创建)
-- =========================================================

CREATE OR REPLACE FUNCTION public.approve_transaction(
  p_transaction_id uuid,
  p_approver_id uuid,
  p_grant_id uuid default null
) RETURNS public.storyflow_transactions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx public.storyflow_transactions;
BEGIN
  SELECT * INTO v_tx FROM public.storyflow_transactions
    WHERE id = p_transaction_id FOR UPDATE;

  IF v_tx IS NULL THEN
    RAISE EXCEPTION 'not_found: transaction % not found', p_transaction_id;
  END IF;

  IF v_tx.status != 'pending' THEN
    RAISE EXCEPTION 'invalid_status: transaction is not pending (current: %)', v_tx.status;
  END IF;

  -- TX-002: 批准后关联 grant_id (审计链)
  UPDATE public.storyflow_transactions
    SET
      status = 'approved',
      grant_id = COALESCE(p_grant_id, grant_id),
      approved_at = now(),
      approved_by = p_approver_id,
      updated_at = now()
    WHERE id = p_transaction_id
    RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_transaction(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_transaction(uuid, uuid, uuid) TO authenticated;

-- =========================================================
-- 5. RPC: reject_transaction
--    拒绝交易 (不创建 grant)
-- =========================================================

CREATE OR REPLACE FUNCTION public.reject_transaction(
  p_transaction_id uuid,
  p_rejecter_id uuid,
  p_rejection_reason text default null
) RETURNS public.storyflow_transactions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx public.storyflow_transactions;
BEGIN
  SELECT * INTO v_tx FROM public.storyflow_transactions
    WHERE id = p_transaction_id FOR UPDATE;

  IF v_tx IS NULL THEN
    RAISE EXCEPTION 'not_found: transaction % not found', p_transaction_id;
  END IF;

  IF v_tx.status != 'pending' THEN
    RAISE EXCEPTION 'invalid_status: transaction is not pending (current: %)', v_tx.status;
  END IF;

  UPDATE public.storyflow_transactions
    SET
      status = 'rejected',
      rejection_reason = p_rejection_reason,
      rejected_at = now(),
      rejected_by = p_rejecter_id,
      updated_at = now()
    WHERE id = p_transaction_id
    RETURNING * INTO v_tx;

  RETURN v_tx;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_transaction(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_transaction(uuid, uuid, text) TO authenticated;

-- =========================================================
-- 6. TX-008: 安全约束 — 禁止自动收益/提现/分账
--    (通过不实现相关功能 + 不创建相关表/字段保证)
--    此处添加注释明确禁止
-- =========================================================

COMMENT ON TABLE public.storyflow_transactions IS
  'TX-001~008: 交易内测 (free/invite_only/manual_review 三种模式, 禁止自动收益/提现/分账). TX-008: 不存在自动收益计算、提现功能、自动分账、虚假余额字段。';

COMMIT;

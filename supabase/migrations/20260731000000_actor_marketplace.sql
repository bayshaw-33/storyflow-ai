-- ============================================================
-- 社区系统 阶段 D：演员市场
-- 日期: 2026-07-31
-- 说明: actor_profiles 上架字段 + 订单表 + 收益账本 + trigger + RLS
-- ============================================================

-- ============================================================
-- 1. storyflow_actor_profiles 加上架字段
-- ============================================================
ALTER TABLE public.storyflow_actor_profiles
  ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'unlisted'
    CHECK (listing_status IN ('unlisted','listed','delisted','removed')),
  ADD COLUMN IF NOT EXISTS listing_price_kk INT,
  ADD COLUMN IF NOT EXISTS listing_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_delisted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_removed_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_actors_listing_status
  ON public.storyflow_actor_profiles(listing_status)
  WHERE listing_status = 'listed';

-- ============================================================
-- 2. storyflow_actor_orders 订单表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_actor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.storyflow_actor_profiles(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES public.storyflow_projects(id) ON DELETE SET NULL,
  price_kk INT NOT NULL CHECK (price_kk >= 0),
  platform_fee_kk INT NOT NULL DEFAULT 0 CHECK (platform_fee_kk >= 0),
  seller_revenue_kk INT NOT NULL DEFAULT 0 CHECK (seller_revenue_kk >= 0),
  platform_fee_rate INT NOT NULL DEFAULT 1 CHECK (platform_fee_rate >= 0 AND platform_fee_rate <= 100),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','refunded','revoked')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  refunded_at TIMESTAMPTZ,
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_actor_orders_buyer ON public.storyflow_actor_orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_actor_orders_seller ON public.storyflow_actor_orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_actor_orders_actor ON public.storyflow_actor_orders(actor_id);

-- 唯一购买约束：同买家+演员+项目只能一笔 paid 订单
-- project_id 为 NULL 时用 TEXT 零值占位，使唯一索引生效
CREATE UNIQUE INDEX IF NOT EXISTS uq_actor_orders_actor_buyer_project
  ON public.storyflow_actor_orders(
    actor_id,
    buyer_id,
    COALESCE(project_id, '__no_project__')
  )
  WHERE status = 'paid';

-- ============================================================
-- 3. storyflow_actor_usages 加 order_id 字段
-- ============================================================
ALTER TABLE public.storyflow_actor_usages
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.storyflow_actor_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_actor_usages_order
  ON public.storyflow_actor_usages(order_id)
  WHERE order_id IS NOT NULL;

-- ============================================================
-- 4. storyflow_creator_revenue_ledger 收益账本
-- ============================================================
CREATE TABLE IF NOT EXISTS public.storyflow_creator_revenue_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.storyflow_actor_orders(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.storyflow_actor_profiles(id) ON DELETE RESTRICT,
  amount_kk INT NOT NULL CHECK (amount_kk >= 0),
  fee_kk INT NOT NULL DEFAULT 0,
  gross_kk INT NOT NULL CHECK (gross_kk >= amount_kk),
  type TEXT NOT NULL DEFAULT 'sale' CHECK (type IN ('sale','refund','settlement','withdrawal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','withdrawn')),
  settlement_period TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_revenue_ledger_user ON public.storyflow_creator_revenue_ledger(user_id, status);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_period ON public.storyflow_creator_revenue_ledger(settlement_period);
CREATE INDEX IF NOT EXISTS idx_revenue_ledger_order ON public.storyflow_creator_revenue_ledger(order_id);

-- ============================================================
-- 5. storyflow_actor_usage_grants 视图
-- ============================================================
CREATE OR REPLACE VIEW public.storyflow_actor_usage_grants AS
SELECT
  o.buyer_id,
  o.actor_id,
  o.project_id,
  o.id AS order_id,
  o.paid_at,
  o.price_kk,
  CASE
    WHEN o.price_kk = 0 THEN 'free'
    WHEN o.project_id IS NOT NULL THEN 'project'
    ELSE 'global'
  END AS grant_type
FROM public.storyflow_actor_orders o
WHERE o.status = 'paid';

-- ============================================================
-- 6. 订单创建 trigger（自动写收益账本）
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_actor_order_revenue()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.storyflow_creator_revenue_ledger (
    user_id, order_id, actor_id, amount_kk, fee_kk, gross_kk, type, status
  )
  VALUES (
    NEW.seller_id, NEW.id, NEW.actor_id,
    NEW.seller_revenue_kk, NEW.platform_fee_kk, NEW.price_kk,
    'sale', 'pending'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_actor_order_revenue ON public.storyflow_actor_orders;
CREATE TRIGGER trg_actor_order_revenue
  AFTER INSERT ON public.storyflow_actor_orders
  FOR EACH ROW EXECUTE FUNCTION public.record_actor_order_revenue();

-- ============================================================
-- 7. RLS 策略
-- ============================================================

-- actor_profiles: 本人可读所有；他人可读 listed/delisted/removed
-- 注意：现有 actor_profiles 可能已有 RLS，这里补充 marketplace 相关策略
-- 如果表已 ENABLE RLS，以下策略会追加；如果未 ENABLE，先启用
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c WHERE c.relname = 'storyflow_actor_profiles' AND c.relrowsecurity = true
  ) THEN
    ALTER TABLE public.storyflow_actor_profiles ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 本人可读自己的所有演员
DROP POLICY IF EXISTS actors_marketplace_self_read ON public.storyflow_actor_profiles;
CREATE POLICY actors_marketplace_self_read
  ON public.storyflow_actor_profiles
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- 市场可见：listed（所有人可购买）+ delisted/removed（已购买家仍可见）
DROP POLICY IF EXISTS actors_marketplace_public_read ON public.storyflow_actor_profiles;
CREATE POLICY actors_marketplace_public_read
  ON public.storyflow_actor_profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    listing_status = 'listed'
    OR listing_status = 'delisted'
    OR listing_status = 'removed'
    OR owner_id = auth.uid()
  );

-- 本人可改自己的演员上架字段
DROP POLICY IF EXISTS actors_marketplace_self_update ON public.storyflow_actor_profiles;
CREATE POLICY actors_marketplace_self_update
  ON public.storyflow_actor_profiles
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- actor_orders: 买家或卖家可读
ALTER TABLE public.storyflow_actor_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS actor_orders_self_read ON public.storyflow_actor_orders;
CREATE POLICY actor_orders_self_read
  ON public.storyflow_actor_orders
  FOR SELECT
  TO authenticated
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

-- 不允许通过 RLS 直接 INSERT/UPDATE 订单（只能通过 service role 在 API 路由内操作）
-- service role 绕过 RLS，所以 API 路由用 service role client 操作

-- creator_revenue_ledger: 本人可读
ALTER TABLE public.storyflow_creator_revenue_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS revenue_ledger_self_read ON public.storyflow_creator_revenue_ledger;
CREATE POLICY revenue_ledger_self_read
  ON public.storyflow_creator_revenue_ledger
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- Migration 完成
-- ============================================================

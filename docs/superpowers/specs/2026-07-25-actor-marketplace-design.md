# 演员市场（阶段 D）设计文档

**项目**: kiikis.com 社区系统
**阶段**: D（演员市场）—— 5 阶段路线图（A→D→B→C→E）的第二阶段
**日期**: 2026-07-25
**状态**: 已批准，实施中

## 路线图背景

社区系统 5 阶段路线图（A→D→B→C→E）：
- **A** 用户资料与公开主页（已完成）
- **D** 演员市场（本期）—— 付费使用 + 订单 + 分账
- **B** 作品/宇宙公开展示（探索页 + 发布流程）
- **C** 宇宙共创邀请
- **E** 宇宙改编授权

## 1. 目标与定位

演员市场让创作者把自己的演员上架，供其他用户购买使用。核心机制：
- 创作者自定价（每个演员单独设价，KK 币整数，可免费）
- 按项目授权（一个项目内无限用）或通用授权（任意项目可用）
- 平台抽成 1%，创作者收益月结
- 同一演员可卖给无数人（非独家）
- 已售订单不可下架，免费/未售可下架

## 2. 数据库 Schema 扩展

### 2.1 storyflow_actor_profiles 加字段

```sql
ALTER TABLE public.storyflow_actor_profiles
  ADD COLUMN IF NOT EXISTS listing_status TEXT DEFAULT 'unlisted'
    CHECK (listing_status IN ('unlisted','listed','delisted','removed')),
  ADD COLUMN IF NOT EXISTS listing_price_kk INT,
  ADD COLUMN IF NOT EXISTS listing_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_delisted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS listing_removed_reason TEXT;
```

字段语义：
- `listing_status`: unlisted(未上架/默认) / listed(已上架) / delisted(主动下架) / removed(平台下架)
- `listing_price_kk`: NULL=免费；正整数=KK 币价格
- `listing_published_at`: 首次上架时间
- `listing_delisted_at`: 主动下架时间
- `listing_removed_reason`: 平台下架原因

### 2.2 storyflow_actor_orders 订单表

```sql
CREATE TABLE IF NOT EXISTS public.storyflow_actor_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.storyflow_actor_profiles(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES public.storyflow_projects(id) ON DELETE SET NULL,
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

-- 唯一购买约束：同买家+演员+项目只能一笔 paid 订单
CREATE UNIQUE INDEX IF NOT EXISTS uq_actor_orders_actor_buyer_project
  ON public.storyflow_actor_orders(actor_id, buyer_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'paid';
```

关键约束：
- project_id 为 NULL 表示"通用授权"（任意项目可用）
- project_id 非 NULL 表示"项目专属授权"
- price_kk = 0 用于免费演员（仍记录订单用于统计）
- platform_fee_rate = 1 表示 1% 抽成
- platform_fee_kk = floor(price_kk * 1 / 100)
- seller_revenue_kk = price_kk - platform_fee_kk

### 2.3 storyflow_actor_usages 加 order_id

```sql
ALTER TABLE public.storyflow_actor_usages
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.storyflow_actor_orders(id) ON DELETE SET NULL;
```

### 2.4 storyflow_creator_revenue_ledger 收益账本

```sql
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
```

状态机：
- pending（待结算）→ settled（已结算，可提现）→ withdrawn（已提现）
- 每月 1 号 cron 把上月 pending 改为 settled

### 2.5 storyflow_actor_usage_grants 视图

```sql
CREATE OR REPLACE VIEW public.storyflow_actor_usage_grants AS
SELECT
  o.buyer_id, o.actor_id, o.project_id, o.id AS order_id, o.paid_at, o.price_kk,
  CASE
    WHEN o.price_kk = 0 THEN 'free'
    WHEN o.project_id IS NOT NULL THEN 'project'
    ELSE 'global'
  END AS grant_type
FROM public.storyflow_actor_orders o
WHERE o.status = 'paid';
```

### 2.6 订单创建 trigger（自动写收益账本）

```sql
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

CREATE TRIGGER trg_actor_order_revenue
  AFTER INSERT ON public.storyflow_actor_orders
  FOR EACH ROW EXECUTE FUNCTION public.record_actor_order_revenue();
```

### 2.7 RLS 策略

- actor_profiles: 本人可读所有；他人可读 listed/delisted/removed（已购买家仍可见）
- actor_orders: 买家或卖家可读
- creator_revenue_ledger: 本人可读

## 3. API 设计

### 3.1 上架管理（创作者）

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/actors/[actorId]/listing | 登录+所有者 | 获取上架状态 |
| PATCH | /api/actors/[actorId]/listing | 登录+所有者 | 上架/下架/改价 |

PATCH 入参：
```json
{ "action": "publish" | "delist" | "update_price", "price_kk": 50 | null }
```

### 3.2 市场详情页

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/actors/[actorId]/market | 公开 | 演员市场详情（价格+销售统计+创作者信息+买家购买状态） |

### 3.3 购买

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| POST | /api/actors/[actorId]/purchase | 登录 | 购买（preview_only 返回费用摘要；实际扣费+建单） |

入参：
```json
{ "project_id": "uuid" | null, "preview_only": false }
```

流程：
1. 校验 listing_status='listed'
2. 校验买家 != 卖家
3. 校验未重复购买（同 actor+buyer+project 且 paid）
4. 校验买家未持有通用授权（若已有通用授权，拒绝再购任何授权）
5. 查余额，免费演员跳过扣费
6. 扣 KK 币（复用现有 credits 扣费逻辑）
7. 计算抽成：fee = floor(price * 1 / 100), revenue = price - fee
8. INSERT 订单（trigger 自动写收益账本）
9. 返回订单 + 剩余余额

### 3.4 买家已购列表

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/actors/purchased | 登录 | 已购演员列表（含授权范围） |

Query: `?scope=global|project&project_id=xxx&cursor=xxx&limit=12`

### 3.5 销售面板

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/dashboard/sales/summary | 登录 | 销售总览（总收益/待结算/可提现/已提现/本月） |
| GET | /api/dashboard/sales/orders | 登录 | 订单列表（分页） |
| GET | /api/dashboard/sales/revenue | 登录 | 收益明细（分页） |
| GET | /api/dashboard/sales/listings | 登录 | 我的上架 + 销量 |

### 3.6 管理员

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| GET | /api/admin/actors/listings | 管理员 | 所有上架演员 |
| POST | /api/admin/actors/[actorId]/remove | 管理员 | 强制下架 |
| POST | /api/admin/actors/[actorId]/restore | 管理员 | 恢复上架 |

### 3.7 月结 cron

| 方法 | 路由 | 鉴权 | 用途 |
|---|---|---|---|
| POST | /api/cron/settle-revenue | CRON_SECRET | 每月 1 号把上月 pending 改为 settled |

vercel.json:
```json
{ "crons": [{ "path": "/api/cron/settle-revenue", "schedule": "0 0 1 * *" }] }
```

## 4. 购买流程

```
买家点击"购买"
  → POST /api/actors/[id]/purchase (preview_only=true) 返回费用摘要
  → 前端弹确认弹窗（价格+授权范围+余额+购买后余额）
  → 买家确认
  → POST /api/actors/[id]/purchase (preview_only=false, project_id=xxx)
  → 服务端事务：校验+扣费+建单+写账本
  → toast "购买成功，演员已加入你的演员库"
  → mutate 刷新演员库 + 已购列表
```

### 4.1 抽成计算

```ts
const PLATFORM_FEE_RATE = 1; // 1%
function calculateFees(priceKk: number) {
  const feeKk = Math.floor((priceKk * PLATFORM_FEE_RATE) / 100);
  const revenueKk = priceKk - feeKk;
  return { feeKk, revenueKk };
}
```

1% 抽成在低价（≤99 KK）时为 0，这是自然结果。

### 4.2 重复购买校验

- 同买家+演员+项目只能一笔 paid 订单
- 已有通用授权（project_id IS NULL 且 paid）→ 拒绝再购任何授权
- 已有项目 A 专属 → 仍可购通用授权或项目 B 专属

### 4.3 免费演员

- price_kk = 0 或 NULL 都视为免费
- 仍创建订单（price_kk=0, fee=0, revenue=0）
- trigger 仍写收益账本（amount=0, status=pending）
- 免费演员的"购买"实际是"领取到演员库"

### 4.4 演员库查询（买家视角）

买家的演员库 = 本人创建的 UNION 已购买的（含免费领取的）

### 4.5 错误码

| 场景 | HTTP | 错误码 |
|---|---|---|
| 演员未上架 | 400 | NOT_LISTED |
| 买家是卖家 | 400 | CANNOT_BUY_OWN |
| 重复购买 | 409 | ALREADY_PURCHASED |
| 余额不足 | 402 | INSUFFICIENT_BALANCE |
| 演员不存在 | 404 | ACTOR_NOT_FOUND |
| 项目不属于买家 | 403 | PROJECT_NOT_OWNED |

## 5. 页面与路由

### 5.1 路由

- `/actors` — 演员库（上半部分"我的演员"现有逻辑不变 + 下半部分"演员市场"新增）
- `/actors/[actorId]` — 演员市场详情页（现有详情页增强：加购买卡 + 多视图 + 创作者信息）
- `/actors/purchased` — 已购演员列表
- `/dashboard/sales` — 创作者销售面板

### 5.2 /actors 列表页布局

```
┌─────────────────────────────────────────┐
│ 演员库                                   │
├─────────────────────────────────────────┤
│ 我的演员 · 8 个                          │  现有逻辑不变
│ [本人创建的演员网格]                     │
├─────────────────────────────────────────┤
│ 演员市场 · 探索其他创作者的演员          │  新增
│ [筛选: 免费·付费·最新·热门]             │
│ [ActorMarketCard 网格，带价格徽标]      │
│ [加载更多]                               │
└─────────────────────────────────────────┘
```

### 5.3 /actors/[actorId] 市场详情页

布局：
- 顶部：主视图（3:4）+ 演员名 + tagline + 创作者信息（头像+用户名+链接）
- 简介 + 标签
- 多视图预览（正/侧/背/全身）
- 购买卡：价格 + 销量 + 被使用次数 + 授权范围选择 + 购买按钮
- 创作者其他演员（横向滚动）

交互：
- 未登录：可看信息+价格，购买按钮"登录后购买"
- 已登录未购买：显示价格+项目选择+购买按钮
- 已购买：显示"已购 ✓"+"使用此演员"按钮
- 免费演员：显示"免费"+"添加到我的演员库"
- 本人（所有者）：显示"这是你的演员"+"编辑上架"按钮
- 已下架：未购买访客看"已下架"，已购买访客正常使用

### 5.4 /actors/purchased 已购列表

- 4 列网格，复用 ActorCard + 授权范围徽标
- 筛选 Tab：全部 / 通用授权 / 项目专属（按项目分组）

### 5.5 /dashboard/sales 销售面板

- 收益总览卡（总收益/待结算/可提现/已提现/本月）
- 3 个 Tab：订单 / 收益明细 / 我的上架
- 提现按钮提示"提现功能即将开放"

## 6. 收益结算逻辑

### 6.1 状态机

pending（待结算）→ settled（已结算，可提现）→ withdrawn（已提现）

### 6.2 月结 cron

每月 1 号 00:00 UTC 自动把上月及更早的 pending 改为 settled：
```sql
UPDATE storyflow_creator_revenue_ledger
SET status = 'settled', settled_at = now(),
    settlement_period = to_char(now() - interval '1 month', 'YYYYMM')
WHERE status = 'pending' AND created_at < date_trunc('month', now());
```

### 6.3 提现

本期不做提现功能，UI 显示"可提现余额"，按钮提示"即将开放"。

## 7. 关键设计点

- 收益立即可见但不可提现（待月结）
- 价格变更不影响已售订单
- 下架不影响已购（已购买家仍可使用）
- 免费演员仍记录订单用于统计
- 平台强制撤销订单（管理员）：status='revoked'，收益账本写 refund 记录，买家 KK 币退还（本期可选实现）

## 8. 文件结构

### 新增 migration
- `supabase/migrations/20260731000000_actor_marketplace.sql`

### 新增 lib
- `lib/marketplace/pricing.ts` — 抽成计算
- `lib/marketplace/purchase-flow.ts` — 购买流程核心逻辑
- `lib/marketplace/revenue-stats.ts` — 销售总览聚合
- `lib/supabase/marketplace-queries.ts` — 市场查询

### 新增 API 路由
- `app/api/actors/[actorId]/{market,purchase,listing}/route.ts`
- `app/api/actors/purchased/route.ts`
- `app/api/dashboard/sales/{summary,orders,revenue,listings}/route.ts`
- `app/api/admin/actors/{listings,[actorId]/remove,[actorId]/restore}/route.ts`
- `app/api/cron/settle-revenue/route.ts`

### 新增组件
- `components/marketplace/` — ActorMarketCard, ActorMarketDetail, PurchaseDialog, PriceBadge, GrantTypeBadge
- `components/dashboard/` — SalesOverview, SalesTabs, OrdersList, RevenueList, ListingsList
- `components/actors/ListingEditor.tsx`

### 新增页面
- `app/actors/purchased/page.tsx`
- `app/dashboard/sales/page.tsx`

### 修改文件
- `app/actors/[actorId]/page.tsx` — 改造为市场详情页
- `app/actors/page.tsx` — 加演员市场区块 + 已购链接
- `app/dashboard/page.tsx` — 加销售面板入口
- `lib/supabase/profile-queries.ts` — 加 getBuyerActorLibrary()
- `lib/i18n/dictionaries.ts` — 加 marketplace/sales 文案
- `vercel.json` — 加 cron 配置

## 9. 实施顺序

1. DB migration
2. lib 层
3. API 路由
4. 组件层
5. 页面层 + 集成改造
6. i18n 文案
7. vercel.json cron
8. 本地构建验证 + commit + push

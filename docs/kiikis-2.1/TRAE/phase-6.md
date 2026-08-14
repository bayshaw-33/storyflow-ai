# KIIKIS 2.1 Phase 6：TRAE 任务文件

> 订阅与交易内测 — Stripe 生命周期 / 权益同步 / 交易内测
> PRD 来源：§10 + §12.3 + §13
> Gate 5：订阅与观测
> 基线：main `b898cb3a`（含 Phase 0-5）

## 分支

```
trae/K2-6-Phase6-subscription
基于：origin/main (b898cb3a)
```

## 概述

Phase 6 实现 Stripe 订阅全生命周期与交易内测：customer 映射、checkout、webhook 验签与幂等、订阅状态同步、权益由服务器读取、Customer Portal、交易内测三种模式与审计。通过 Gate 5。

依赖 Phase 1 creative_events（BI-010 账单事件写入）、Phase 4 grants（TX-002 批准结果创建 grant）、Phase 0 feature-flags（TX-007 fixture 控制）。

## 需求清单

### Task 6.1：Stripe 订阅核心生命周期 (BI-001~008)

**BI-001：Stripe customer 与 Kiikis user 一一映射**
- 服务端创建/查找 Stripe customer，与 Kiikis user_id 一一映射
- 映射存储在 subscriptions 表（user_id UNIQUE, stripe_customer_id UNIQUE）
- 重复调用不创建多个 customer
- 有测试验证：同一 user 只有一个 customer

**BI-002：Checkout 只创建允许列表内 price 的会话**
- 维护允许的 price_id 白名单（环境变量或配置表）
- Checkout session 创建时校验 price_id 在白名单内
- 拒绝未授权的 price
- 有测试验证：白名单外 price 被拒绝

**BI-003：success URL 只显示确认中，不授予权益**
- Checkout success_url 指向"确认中"页面，不直接授予权益
- 权益只由 webhook 确认后授予（关联 BI-008）
- 有测试验证：success 页面不包含权益授予逻辑

**BI-004：webhook 使用原始 body 和 secret 验签**
- webhook endpoint 读取原始 raw body（非 parsed JSON）
- 使用 Stripe webhook secret 验证签名
- 验签失败返回 400，不处理
- secret 仅在服务器环境变量，不暴露客户端
- 有测试验证：篡改 body / 错误 secret 被拒绝

**BI-005：按 Stripe event ID 幂等处理**
- subscription_events 表记录已处理的 event_id
- 重复 event 直接返回 200，不重复处理
- 有测试验证：同一 event_id 二次到达不重复执行

**BI-006：拒绝用较旧事件覆盖较新订阅状态**
- 每次状态更新记录 Stripe event 的 created timestamp
- 如果收到的事件 created 早于当前已记录的最新状态，拒绝覆盖
- 有测试验证：乱序事件不覆盖较新状态

**BI-007：同步 checkout、subscription、invoice 和 refund 生命周期**
- 处理事件类型：checkout.session.completed、customer.subscription.created/updated/deleted、invoice.paid、charge.refunded
- 每种事件类型更新对应状态字段
- 订阅状态机：incomplete → active → past_due → canceled / ended
- 有测试验证：各事件类型正确更新状态

**BI-008：plan entitlement 只由服务器读取 webhook 同步状态**
- 客户端不持有 entitlement 判定逻辑
- 权益查询通过 API 调用服务器，服务器读取 webhook 同步的订阅状态
- 服务器返回 plan tier 和有效权益列表
- 有测试验证：客户端无法伪造权益

**交付文件**：
- `supabase/migrations/20260827060000_kiikis_21_billing.sql` — subscriptions + subscription_events + entitlements 表 + RLS + 索引
- `lib/contracts/v2/billing.ts` — Subscription, SubscriptionEvent, Plan, Entitlement 契约
- `lib/server/v2/billing/stripe.ts` — Stripe 集成核心（customer 创建/查找、checkout 创建）
- `lib/server/v2/billing/webhook.ts` — Webhook 验签、幂等、事件处理、状态同步
- `lib/server/v2/billing/entitlements.ts` — 权益读取服务（只读 webhook 同步状态）
- `app/api/v2/billing/checkout/route.ts` — Checkout session 创建
- `app/api/v2/billing/webhook/route.ts` — Stripe webhook 接收（raw body + 验签）
- `app/api/v2/billing/subscription/route.ts` — 订阅状态查询
- `app/api/v2/billing/entitlements/route.ts` — 权益查询
- `tests/kiikis-21-billing-stripe.test.mjs`

### Task 6.2：Customer Portal 与观测 (BI-009~010)

**BI-009：提供 Customer Portal 或等价取消/支付方式入口**
- 创建 Stripe Customer Portal session，跳转到 Stripe 管理页面
- 用户可在此取消订阅、更新支付方式
- 如 Portal 不可用，提供等价的 API 端点（取消订阅、更新支付方式）
- 有测试验证：Portal session 创建成功

**BI-010：账单状态变化写入 Creative Event、审计和观测**
- 每次订阅状态变化（创建/激活/取消/退款等）写入 creative_events
- event_type 使用 billing.* 前缀（如 billing.subscription.activated）
- payload 包含 plan_id、status、amount（不含 Stripe secret）
- 审计日志记录：谁、何时、什么变化
- 有测试验证：状态变化产生 creative event

**交付文件**：
- `lib/server/v2/billing/portal.ts` — Customer Portal 服务
- `app/api/v2/billing/portal/route.ts` — Portal session 创建跳转
- `app/api/v2/billing/cancel/route.ts` — 取消订阅（如 Portal 不可用的等价方案）
- `tests/kiikis-21-billing-portal.test.mjs`

### Task 6.3：交易内测 (TX-001~008)

**TX-001：只开放 free、invite_only、manual_review 三种模式**
- 交易模式枚举：free（免费使用）、invite_only（邀请制）、manual_review（人工审核）
- 禁止其他模式（如自动付费、自动分账）
- 模式存储在 transactions 表的 mode 字段
- 有测试验证：只允许三种模式

**TX-002：每个批准结果创建真实、可审计 grant**
- 交易批准后，调用 Phase 4 grant 服务创建 grant
- grant 记录关联 transaction_id
- grant 有完整审计链（谁批准、何时、基于什么条款）
- 有测试验证：批准 → grant 创建 → grant 可查

**TX-003：保存 order、attribution 和创建时条款快照**
- 交易记录包含：order 信息、attribution（来源归因）、创建时条款快照
- 条款快照不可变，即使后续条款变更也不影响历史交易
- 有测试验证：条款变更后历史交易仍保持原快照

**TX-004：明示费用、争议和 settlement intent**
- 交易记录明示：费用金额（可为 0）、争议处理方式、结算意图
- settlement_intent：如 "manual_settlement"（人工结算）
- 有测试验证

**TX-005：未移动资金时 paid amount 必须为 0**
- free 模式：paid_amount = 0
- invite_only 模式：paid_amount = 0（邀请制不涉及资金）
- manual_review 模式：在资金未实际移动前 paid_amount = 0
- 有测试验证：各模式下 paid_amount 正确

**TX-006：UI 明示免费、邀请制、人工审核或人工结算**
- 交易相关 UI 明确标注当前模式
- 不暗示自动到账、自动收益
- 有测试验证

**TX-007：staging/prod 默认关闭交易 fixture，演示数据永久标记**
- 交易 fixture 只在开发/预览环境启用（feature flag）
- staging/prod 默认关闭 fixture
- 演示数据永久标记 is_demo = true，不与真实数据混淆
- 有测试验证：prod 环境 fixture 关闭

**TX-008：禁止自动收益、提现、分账或虚假余额暗示**
- 不实现自动收益计算
- 不实现提现功能
- 不实现自动分账
- UI 不显示虚假余额或收益数字
- 有测试验证：无相关功能存在

**交付文件**：
- `supabase/migrations/20260827060100_kiikis_21_transactions.sql` — transactions + transaction_terms 表 + RLS
- `lib/contracts/v2/transactions.ts` — Transaction, Order, TermsSnapshot 契约
- `lib/server/v2/transactions/orders.ts` — 交易订单服务（模式校验、grant 创建、条款快照）
- `app/api/v2/transactions/orders/route.ts` — 订单列表/创建
- `app/api/v2/transactions/orders/[id]/route.ts` — 订单详情
- `tests/kiikis-21-transactions.test.mjs`

### Task 6.4：E2E + Verify

- `e2e/billing.spec.ts` — Stripe test 生命周期 E2E：checkout → webhook → 激活 → 取消 → 退款
- `scripts/verify-subscription.mjs` — 验证脚本（覆盖 BI/TX 全部需求项）

## Gate 5 判定标准

- Stripe test 完整生命周期通过
- 内部真实小额订阅完成付款、取消和退款验证
- 权益只由 webhook 同步状态授予
- 核心事件、成本和漏斗可观测

## 约束

- 不修改共享文件（package.json, pnpm-lock.yaml, middleware.ts, app/layout.tsx, components/AppShell.tsx, app/globals.css, lib/universe.ts）
  - ⚠️ 例外：如需安装 `stripe` npm 包，必须修改 package.json — 此时允许，但需在 commit message 注明原因
- 不修改 Phase 0-5 已交付文件
- 不修改 lib/server/v2/feature-flags.ts（新增 flag 通过新文件或配置表）
- contract_version: 2.1.0-alpha.1
- 新建文件在 lib/server/v2/billing/, lib/server/v2/transactions/, lib/contracts/v2/, app/api/v2/billing/, app/api/v2/transactions/, components/v2/billing/, tests/, e2e/, scripts/
- 测试用 .mjs + node:test，与 Phase 1-5 一致
- Stripe secret 仅在服务器环境变量（§12.3）
- plan entitlement 不信任客户端（§12.3）
- 支付写审计（§12.3）
- forward-only migration（K21-DB-001）
- feature flag 默认 fail closed（K21-FF-001）

## 执行顺序

1. Task 6.1 (BI-001~008) — 先建表和契约，再实现 Stripe 集成核心，再实现 webhook 处理，最后写 API 和测试
2. Task 6.2 (BI-009~010) — 依赖 6.1 的订阅核心
3. Task 6.3 (TX-001~008) — 依赖 6.1 的权益系统和 Phase 4 的 grant
4. Task 6.4 (E2E) — 最后补

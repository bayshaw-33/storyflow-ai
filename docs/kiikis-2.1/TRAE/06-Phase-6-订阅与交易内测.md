# Phase 6：Stripe 订阅生命周期与交易内测

> 只执行本阶段。
> 需求：`K21-BI-001..010`、`K21-TX-001..008`
> 前置：Phase 1、4 COZE PASS
> 完成后交给：`COZE/06-Phase-6-订阅与交易内测验证.md`

## 1. 目标

让 To C 会员订阅成为真实、可取消、可退款、幂等的 Stripe 生命周期；资产交易仅开放免费、邀请和人工审核内测，并诚实显示资金状态。

## 2. Task 6.1：订阅数据与计划映射

**Files:**

- Create: `supabase/migrations/20260827060000_kiikis_21_billing.sql`
- Modify: `lib/billing/plans.ts`
- Create: `lib/billing/stripe-plan-map.ts`
- Create: `tests/kiikis-21-billing-map.test.mjs`

保存 Stripe customer、subscription、price、status、period、cancel_at_period_end、last event created/id。price ID 仅从服务端环境映射到 Kiikis plan；未知 price fail closed。

## 3. Task 6.2：Checkout 安全化

**Files:**

- Modify: `app/api/billing/checkout/route.ts`
- Create: `tests/kiikis-21-checkout.test.mjs`

- user/customer 由服务端认证。
- price 通过允许列表映射，不接受任意 amount/price ID。
- idempotency key 防重复会话。
- success URL 只显示“等待确认”，不升级 plan。

## 4. Task 6.3：Webhook 生命周期

**Files:**

- Create: `app/api/billing/webhook/route.ts`
- Create: `lib/billing/stripe-webhook.ts`
- Create: `tests/kiikis-21-stripe-webhook.test.mjs`

先写测试覆盖：签名错误、重复 event、乱序旧 event、checkout complete、subscription create/update/delete、invoice paid/payment_failed、charge refund。使用原始 body 验签。

```ts
export async function applyStripeEvent(event: StripeEventEnvelope): Promise<"applied" | "duplicate" | "stale">;
```

订阅与 Creative Event/entitlement 更新必须事务化和幂等。

## 5. Task 6.4：Entitlement 与 Customer Portal

**Files:**

- Create: `lib/server/v2/billing/entitlements.ts`
- Create: `app/api/billing/portal/route.ts`
- Modify: `app/subscription/page.tsx`
- Create: `tests/kiikis-21-subscription-entitlement.test.mjs`

只有 webhook-confirmed 状态授予权益。past_due/canceled/refunded 按明确 grace policy 计算，不由 UI 猜测。提供取消和更新支付方式入口。

## 6. Task 6.5：人工交易内测事实

**Files:**

- Create: `lib/contracts/v2/transaction-beta.ts`
- Modify: 现有 V2 order/licensing server modules and routes
- Create: `tests/kiikis-21-transaction-beta.test.mjs`

```ts
type TransactionMode = "free" | "invite_only" | "manual_review";
type SettlementMode = "none" | "manual_intent";
```

保存 order、grant、attribution、fee disclosure、dispute、settlement intent。没有真实 capture 时 `paidAmount=0` 且 UI 不显示自动收益。

## 7. Task 6.6：诚实 UI 与 fixture 隔离

**Files:**

- Modify: `components/v2/licensing/*`
- Modify: `components/v2/creator-center/*`
- Modify: `lib/client/v2/licensing/*`
- Modify: `lib/client/v2/creator-center/*`
- Create: `tests/kiikis-21-transaction-copy.test.mjs`

staging/prod fixture 默认 false。演示数据必须永久带“演示数据”；真实页面只显示数据库事实。用词固定：免费、邀请制、人工审核、人工结算；禁止“可提现”“自动分成”除非真实上线。

## 8. Task 6.7：Stripe CLI/E2E

**Files:**

- Create: `e2e/subscription-lifecycle.spec.ts`
- Create: `e2e/transaction-beta.spec.ts`

Stripe test mode 完成 checkout、webhook、active、cancel_at_period_end、payment_failed、refund；验证 success URL 在 webhook 前不升级。内部真实小额 live-mode 验证只在批准的受控账号执行，密钥不进入录像/日志。

## 9. 验证

```bash
node --test tests/kiikis-21-billing-map.test.mjs tests/kiikis-21-checkout.test.mjs tests/kiikis-21-stripe-webhook.test.mjs tests/kiikis-21-subscription-entitlement.test.mjs tests/kiikis-21-transaction-beta.test.mjs tests/kiikis-21-transaction-copy.test.mjs
npx playwright test e2e/subscription-lifecycle.spec.ts e2e/transaction-beta.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 10. 交付证据

- Stripe test event IDs、事件次序、重复/乱序结果（脱敏）。
- success URL 前后 entitlement 对比。
- active→cancel→refund 状态证据。
- 免费/邀请/人工订单及 grant/attribution/争议事实。
- fixture audit、commit SHA、migration 状态。

## 11. 禁止扩展

- 不做自动分账、提现、公共付费资产、二级市场或付费抽卡。
- 不在客户端验签或信任 success query。
- 不记录完整卡信息、webhook secret 或 Stripe 原始敏感 payload。

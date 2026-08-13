# Phase 6 验证：Stripe 订阅与交易内测

> 验证需求：`K21-BI-001..010`、`K21-TX-001..008`
> 输入：TRAE Phase 6 commit、Stripe test 环境、两个账号

## 1. Checkout 边界

- 未登录不能创建 session。
- 客户端伪造 price/amount/customer/userId 失败。
- 同一 idempotency key 不创建重复 session。
- success URL 到达而 webhook 未处理时仍显示“确认中”，plan 不升级。

## 2. Webhook 验签与幂等

用 Stripe CLI/签名 fixture 验证：

- 错误签名 400，无数据库变化。
- 同 event ID 重放返回 duplicate，无重复 entitlement/event。
- 旧 event 乱序到达返回 stale，不覆盖新状态。
- 不记录 secret、完整支付 payload 或卡信息。

## 3. 生命周期

逐一执行：checkout completed、active、invoice paid、payment failed、cancel at period end、subscription deleted、refund。每步对比 Stripe、Kiikis subscription、plan entitlement、UI。

重点：payment failed/canceled/refunded 的 grace policy 与 PRD/文案一致；不能客户端自行维持高级权益。

## 4. Customer Portal

- Portal session 绑定当前用户 customer。
- 账号 A 不能打开账号 B portal。
- 取消/更新支付方式后 webhook 回流页面。

## 5. 交易内测

验证免费、邀请制、人工审核三类：

- order、grant、attribution、fee disclosure、dispute、settlement intent 可查。
- 未真实 capture 时 paid amount 为 0。
- UI 明确“免费/邀请制/人工审核/人工结算”。
- 无自动收益、可提现余额、自动分账暗示。
- fixture 永久显示演示标记，production-like 默认关闭。

## 6. 自动化复跑

```bash
node --test tests/kiikis-21-billing-map.test.mjs tests/kiikis-21-checkout.test.mjs tests/kiikis-21-stripe-webhook.test.mjs tests/kiikis-21-subscription-entitlement.test.mjs tests/kiikis-21-transaction-beta.test.mjs tests/kiikis-21-transaction-copy.test.mjs
npx playwright test e2e/subscription-lifecycle.spec.ts e2e/transaction-beta.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 7. PASS 门槛

签名、幂等、乱序、完整生命周期、portal 与诚实交易文案全部通过。success URL 授权、跨账号 customer、虚假余额或自动结算暗示均为 P0，结论 FAIL。

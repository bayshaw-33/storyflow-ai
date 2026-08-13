# Phase 3：KK 实时智能体、陪伴与外观基础

> 只执行本阶段。
> 需求：`K21-KK-001..007`、`K21-KK-010..014`、`K21-KK-020..024`
> 前置：Phase 1 COZE PASS
> 完成后交给：`COZE/03-Phase-3-KK实时智能体与外观验证.md`

## 1. 目标

把现有分散的 KK 展示、Gravity/KK3D/localStorage 卡片和 fixture 消息收敛成单一账号级 KK：任务交互第一、陪伴第二、外观收藏第三。

## 2. Task 3.1：KK 账号事实与权益账本

**Files:**

- Create: `supabase/migrations/20260827030000_kiikis_21_kk_profile_inventory.sql`
- Create: `lib/contracts/v2/kk-profile.ts`
- Create: `lib/server/v2/kk/profile.ts`
- Create: `tests/kiikis-21-kk-ledger.test.mjs`

最小表：`storyflow_kk_profiles`、`storyflow_entitlement_ledger`、`storyflow_kk_equipment_history`、`storyflow_kk_memory_facts`。ledger append-only，来源至少支持 `system_migration|creative_milestone|subscription|admin_grant`；2.1 禁止 `paid_draw|trade`。

```ts
type KkEntitlementEntry = {
  id: string;
  ownerId: string;
  itemId: string;
  itemVersion: string;
  direction: "grant" | "revoke";
  sourceType: "system_migration" | "creative_milestone" | "subscription" | "admin_grant";
  sourceId: string;
  idempotencyKey: string;
  createdAt: string;
};
```

先测重复 milestone、跨用户装备、撤销后装备、并发装备，再实现。

## 3. Task 3.2：真实 KK API

**Files:**

- Create: `app/api/v2/kk/route.ts`
- Create: `app/api/v2/kk/events/route.ts`
- Create: `app/api/v2/kk/profile/route.ts`
- Create: `app/api/v2/kk/equipment/route.ts`
- Create: `app/api/v2/kk/memory/route.ts`
- Modify: `lib/client/v2/kk/api.ts`
- Create: `tests/kiikis-21-kk-api.test.mjs`

契约返回 server cursor、task projection、pending confirmations、profile/equipment 和允许的 actions。production/staging 禁止默认 fixture；缺服务端配置时显示明确不可用，不静默切 demo。

## 4. Task 3.3：单一全站 runtime

**Files:**

- Create: `components/v2/kk/KkRuntimeProvider.tsx`
- Create: `components/v2/kk/useKkRuntime.ts`
- Modify: `components/v2/kk/KkCompanion.tsx`
- Modify: `components/v2/kk/KkPanel.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/companions/page.tsx`
- Modify: `app/kk/page.tsx`
- Create: `tests/kiikis-21-kk-runtime.test.mjs`

全站只挂一个 Provider。`/companions` 不再重定向首页；它与 `/kk` 读取同一 runtime。旧视觉组件可作为 skin renderer，但不得保留独立状态真相。

## 5. Task 3.4：Realtime + 补拉

**Files:**

- Create: `lib/client/v2/kk/realtime.ts`
- Create: `lib/client/v2/kk/task-projection.ts`
- Create: `tests/kiikis-21-kk-realtime.test.mjs`

状态机：

```ts
type KkConnectionState = "connecting" | "live" | "reconnecting" | "polling" | "offline";
```

- 从 `storyflow_creative_events` 订阅 owner 可见事件。
- 按 sequence 去重并持久化 last cursor。
- 断线显示最后同步时间；补拉 `afterSequence` 后再恢复 live。
- 无真实数量时只显示 queued/running/ingesting，不伪造百分比。
- 相同 event 重放不得重复 toast、成就或动作。

## 6. Task 3.5：陪伴上下文与高风险确认

**Files:**

- Create: `lib/server/v2/kk/context.ts`
- Create: `lib/server/v2/kk/actions.ts`
- Create: `components/v2/kk/KkConfirmationDialog.tsx`
- Create: `tests/kiikis-21-kk-authority.test.mjs`

KK 上下文只读取用户有权访问的 user/project/universe 摘要。发布、授权、支付、删除、覆盖 Canon 必须返回 confirmation challenge，由用户明确确认后服务端执行。

```ts
type KkProposedAction = {
  actionId: string;
  actionType: string;
  resourceType: string;
  resourceId: string;
  risk: "low" | "high";
  summary: string;
  expiresAt: string;
};
```

## 7. Task 3.6：外观、装备、隐私与成长

**Files:**

- Create: `components/v2/kk/KkAppearance.tsx`
- Create: `components/v2/kk/KkInventory.tsx`
- Create: `lib/server/v2/kk/milestones.ts`
- Modify: `components/v2/kk/kk.module.css`
- Create: `tests/kiikis-21-kk-milestones.test.mjs`

- 用户只能装备 ledger 当前净持有的 item/version。
- profile/community display 默认关闭，用户可按外观/成就选择公开。
- milestone 由 Creative Event 幂等授予，批量垃圾生成不能刷成长。
- 不显示抽卡概率、付费按钮、市场价格或稀缺投资文案。

## 8. Task 3.7：E2E

**Files:**

- Create: `e2e/kk-realtime-companion.spec.ts`
- Create: `e2e/kk-appearance.spec.ts`

覆盖任务跨页面、刷新恢复、断线补拉、失败重试、待确认、高风险取消、装备持久化、隐私关闭和跨账号隔离。

## 9. 验证

```bash
node --test tests/kiikis-21-kk-*.test.mjs
npx playwright test e2e/kk-realtime-companion.spec.ts e2e/kk-appearance.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 10. 交付证据

- production-like 环境 fixture 为 false 的配置证据。
- 事件产生到 UI 显示的 p50/p95，断线补拉耗时。
- 重复事件一次副作用的日志。
- 两个账号的 profile/inventory/RLS 隔离证据。
- 高风险操作确认与取消录像。
- commit SHA 与 migration 状态。

## 11. 禁止扩展

- 不做付费抽卡、二级交易、宠物货币或 pay-to-win。
- 不让 LLM 直接执行授权、支付、发布、删除。
- 不继续维护多个互不相通的 KK 状态容器。

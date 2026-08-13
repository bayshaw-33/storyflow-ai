# Phase 7：全链集成、真实 UAT 与发布门禁

> 只执行本阶段。
> 需求：Gate 0–5、发布运行手册
> 前置：Phase 2–6 COZE PASS
> 完成后交给：`COZE/07-Phase-7-集成UAT与发布验证.md`

## 1. 目标

不再增加产品范围。整合所有阶段，用内部真实创作团队完成六集黄金路径、KK、协作、社区和订阅验证；只有全部 Gate 通过才公开 Kiikis 2.1。

## 2. Task 7.1：基线与迁移审计

**Files:**

- Create: `docs/kiikis-2.1/release/migration-ledger.md`
- Create: `scripts/audit-kiikis-21-release.mjs`

记录每个 migration 的 commit、staging/prod 状态、audit SQL、回滚/前滚策略。脚本检查：fixture、feature flag、缺失 env、公开 service role、旧 `/companions` redirect、Community 占位页、历史 migration 被改写。

## 3. Task 7.2：端到端黄金路径

**Files:**

- Create: `e2e/kiikis-21-golden-path.spec.ts`
- Create: `docs/kiikis-2.1/release/golden-path-evidence.md`

真实旅程：

```text
登录个人账号
→ 创建 Universe/Project/Actor
→ 邀请团队成员
→ 完成六集剧本并生成 handoff
→ 产生 4/6/9/12 动态宫格
→ 人工锁定并处理上游 diff
→ 导出团队 Markdown/JSON/CSV/生产包
→ KK 观察任务、失败、恢复、确认
→ 发布 Universe/Actor/Work
→ 第二账号关注、评论、收藏、申请 use grant
→ 举报、block、审核、申诉、恢复演练
→ Stripe 订阅、取消、退款
```

自动化覆盖可自动部分，真实六集与人工生产判断记录操作者、时间、对象 ID 和证据。

## 4. Task 7.3：性能、恢复与安全

**Files:**

- Create: `scripts/measure-kk-event-latency.mjs`
- Create: `docs/kiikis-2.1/release/security-matrix.md`
- Create: `docs/kiikis-2.1/release/recovery-drills.md`

执行：Realtime 断线、重复 event、任务失败/重试、CAS 冲突、邀请重放、grant 撤销、社区隐藏、Stripe webhook 重放/乱序、Provider 超时。记录 RTO/用户可见行为和数据完整性。

## 5. Task 7.4：观测与运营

**Files:**

- Create: `docs/kiikis-2.1/release/observability.md`
- Create: `docs/kiikis-2.1/release/community-operations.md`
- Create: `docs/kiikis-2.1/release/billing-operations.md`

至少能观测任务成功/失败、跳转 404、事件延迟、handoff→storyboard 漏斗、publication/互动/use grant、订阅状态和 Provider 成本。定义社区举报 SLA、支付异常和人工交易处理人。

## 6. Task 7.5：分级发布与回滚

**Files:**

- Create: `docs/kiikis-2.1/release/rollout-runbook.md`
- Create: `docs/kiikis-2.1/release/rollback-runbook.md`

顺序：internal → invited creators → limited public → public。feature flag 可单独关闭 community、KK appearance、grants UI、billing entry，但不得破坏既有数据读取。数据库使用前滚修复，不自动删除生产事实。

## 7. Gate 核对

- Gate 0：工作台布局和三类跳转。
- Gate 1：六集剧本→分镜→导出。
- Gate 2：KK 真实实时与恢复。
- Gate 3：资源出生权利和 RLS。
- Gate 4：社区互动与治理。
- Gate 5：Stripe 生命周期与观测。

任一 P0/P1 FAIL：不公开发布。Community 的 Coming Soon/邀请门禁只有 Gate 4 和全局 Gate 都通过才移除。

## 8. 最终验证

```bash
pnpm audit:kiikis21
node scripts/audit-kiikis-21-release.mjs
npx tsc --noEmit
pnpm build
pnpm test:unit
node --test tests/ui-v2/**/*.test.mjs tests/kiikis-21-*.test.mjs
npx playwright test --project=chromium
```

若仓库有既存失败，必须给出基线 commit 的同命令对比和明确归属；不得删除测试或把失败静默忽略。

## 9. 交付证据

- Gate 0–5 证据索引和每项 owner。
- 真实六集 UAT 签字确认。
- migration ledger、security matrix、恢复演练、性能数据。
- Stripe 与社区运营就绪确认。
- production deployment URL、commit SHA、Vercel 状态和回滚步骤。

## 10. 禁止扩展

- 不在 release phase 增加新产品功能或重构。
- 不因发布日期跳过审核、支付或权限门禁。
- 不宣布“全面上线”后再补治理或 webhook。

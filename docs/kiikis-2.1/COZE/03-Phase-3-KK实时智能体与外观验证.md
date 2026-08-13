# Phase 3 验证：KK 实时智能体、陪伴与外观

> 验证需求：`K21-KK-001..007`、`K21-KK-010..014`、`K21-KK-020..024`
> 输入：TRAE Phase 3 commit、两个普通账号、production-like 实时环境

## 1. 真实来源核验

- staging/prod-like 的 KK fixture 开关为 false。
- 页面任务 ID 能在服务端任务/event 表找到。
- 无配置时显示不可用，不展示 demo 消息。
- `/kk`、`/companions` 和浮动 KK 读取相同 profile、任务和 cursor。

## 2. 实时与恢复

制造 queued→running→progress→completed、failed、pending confirmation：

- 记录 event.created_at 与 UI 可见时间，至少 30 次计算 p50/p95；p95 ≤ 3 秒。
- 不可量化任务不得出现猜测百分比。
- 断网 20 秒，UI 显示 reconnecting/offline 与最后同步时间。
- 恢复后 ≤10 秒补齐缺失事件，顺序正确。
- 重放事件不重复 toast、成长、奖励或动作。

## 3. 任务操作

- 从 KK 点击任务详情进入正确项目。
- 可重试失败任务只执行一次；重复点击/网络重放幂等。
- 待确认操作明确展示影响；取消不改变业务。
- 发布、授权、支付、删除、覆盖 Canon 未确认时服务端不得执行。

## 4. 陪伴上下文与隐私

- KK 能引用当前 Project/Universe 的允许摘要和真实下一步。
- 切换项目后不串上下文。
- 第二账号不能诱导 KK 读取第一账号私有内容。
- 导出/删除 memory fact 后状态按规则变化。

## 5. 外观与权益

- 账号 A 装备已持有 item，跨页面/设备恢复。
- 未持有/已撤销 item 不能装备。
- 并发装备只有一个 current；历史可审计。
- 同一 milestone 重放只授予一次。
- 社区展示默认关闭；关闭后 public profile 不泄露外观/成就。
- UI 无付费抽卡、二级交易、币价或 pay-to-win。

## 6. 自动化复跑

```bash
node --test tests/kiikis-21-kk-*.test.mjs
npx playwright test e2e/kk-realtime-companion.spec.ts e2e/kk-appearance.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 7. PASS 门槛

真实事件、时延、补拉、幂等、权限、确认和账号级库存全部通过。任何 fixture 冒充、私有上下文泄漏或高风险免确认均为 P0，结论 FAIL。

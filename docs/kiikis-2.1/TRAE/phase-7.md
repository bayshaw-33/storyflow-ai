# KIIKIS 2.1 Phase 7：TRAE 任务文件

> Gate 0-5 全部复验 → 移除 Community 公开限制 → 2.1 全面上线
> PRD 来源：§14 + §15 + §16
> Gate：全部（Gate 0-5 复验 + 版本完成定义）
> 基线：main `981bbd83`（含 Phase 0-6）

## 分支

```
trae/K2-7-Phase7-gate-validation
基于：origin/main (981bbd83)
```

## 概述

Phase 7 是最终验证阶段：运行全部 verify 脚本和测试，修复发现的问题，移除 Community feature flag 限制（CM-010），完成 Gate 0-5 全部复验，满足 §16 版本完成定义，宣布 Kiikis 2.1 全面上线。

## 需求清单

### Task 7.1：全量验证脚本 + 测试运行

运行所有 Phase 0-6 的 verify 脚本和单元测试，修复发现的失败项。

**验证脚本（逐个运行，0 errors 为通过）：**
- `scripts/verify-baseline.mjs`（Phase 0 — UI/NAV 基线）
- `scripts/verify-screenplay.mjs`（Phase 2 — 剧本到分镜）
- `scripts/verify-kk-runtime.mjs`（Phase 3 — KK 全站交互）
- `scripts/verify-grants.mjs`（Phase 4 — 资源权利）
- `scripts/verify-community.mjs`（Phase 5 — IP 资产社区）
- `scripts/verify-subscription.mjs`（Phase 6 — 订阅与交易）

**单元测试（全量运行，0 failures 为通过）：**
- `tests/kiikis-21-*.test.mjs`（Phase 1-6 全部测试文件）

**交付要求：**
- 所有 verify 脚本 0 errors
- 所有单元测试 0 failures
- 如有失败项：定点修复，不重写整文件
- 记录最终测试总数和通过数

### Task 7.2：移除 Community 公开限制 (CM-010 解除)

Phase 5 的 CM-010 通过 `communityBeta` feature flag 保护 /community 路由。Phase 7 解除此限制，使 /community 公开可访问。

**具体操作：**
- 修改 `app/community/page.tsx`：移除 communityBeta flag 检查，或将其默认值改为 true
- 或修改 `lib/server/v2/feature-flags.ts`：将 communityBeta 默认值从 false 改为 true
- 确保 /community 在无登录状态下也能正常渲染发现页
- 确保 community API 路由不再受 communityBeta 限制（匿名用户可浏览 public publication）
- 有测试验证：未登录用户可访问 /community

**注意：**
- 此 Task 允许修改 `feature-flags.ts` 和 `app/community/page.tsx`（Phase 7 特例）
- 其他 Phase 0-6 已交付文件不得修改（除非 7.1 发现需要修复的 bug）
- 匿名用户仍受 RLS 限制（只能看 public，不能互动）

### Task 7.3：Gate 0-5 复验脚本

创建综合验证脚本，覆盖 §14 全部 Gate 定义：

**交付文件：**
- `scripts/verify-gate-all.mjs` — 综合 Gate 0-5 验证脚本

**Gate 0 检查项：**
- 工作台无压缩/遮挡/横向溢出
- 项目卡、Dashboard 任务、任务中心详情进入正确目标
- 无点击无响应或 fixture 404

**Gate 1 检查项：**
- 剧本到分镜链路文件存在（ScreenplayHandoffV1, 动态宫格分镜）
- 导出功能文件存在（Markdown/JSON/CSV/生产包）
- 无 P0/P1 数据丢失风险代码（检查无破坏性覆盖逻辑）

**Gate 2 检查项：**
- KK runtime 文件存在
- fixture 在 staging/prod 默认关闭（检查 feature-flags 配置）
- KK 事件/任务/错误 API 路由存在
- Realtime 降级轮询逻辑存在

**Gate 3 检查项：**
- grants 服务和 API 路由存在
- RLS 策略文件存在
- 权限矩阵覆盖（owner/collaborator/viewer）
- 撤销逻辑保留历史事实（不物理删除）

**Gate 4 检查项：**
- community 全部 API 路由存在（discover, publications, follows, reactions, bookmarks, comments, reports, blocks, moderation, appeals）
- 举报→审核→申诉→恢复全链路代码存在
- 权限矩阵 4 角色（匿名/普通/被屏蔽/审核员）

**Gate 5 检查项：**
- billing 全部 API 路由存在（checkout, webhook, subscription, entitlements, portal, cancel）
- transactions 全部 API 路由存在（orders, orders/[id]）
- webhook 验签+幂等+旧事件拒绝逻辑存在
- 交易模式只允许 free/invite_only/manual_review
- 无自动收益/提现/分账代码

### Task 7.4：最终 E2E + 版本完成确认

**交付文件：**
- `e2e/gate-validation.spec.ts` — 跨 Phase 综合冒烟测试

**E2E 覆盖（轻量冒烟，非全量回归）：**
1. 工作台正常加载，无压缩（Gate 0）
2. 创建剧本 → 交接 → 分镜生成（Gate 1）
3. KK runtime 挂载，显示任务（Gate 2）
4. 创建资源 → 邀请/分享（Gate 3）
5. /community 发现页可访问（Gate 4，解除限制后）
6. /api/v2/billing/entitlements 返回（Gate 5）

**§16 版本完成定义确认：**
- [ ] 真实创作生产连续且可恢复
- [ ] KK 是全站实时 AI 入口和持续陪伴
- [ ] 资源出生即具备权利和协作能力
- [ ] 社区围绕真实 IP 对象并可安全运营
- [ ] 订阅真实、交易内测诚实
- [ ] 所有关系能成为未来 3D 世界、AI 角色生活和 KK 经济的同一事实基础

## Gate 全部判定标准

只有 Gate 0-5 全部通过，才能移除 Community 的公开限制并宣布 Kiikis 2.1 全面上线。

## 约束

- 不修改 Phase 0-6 已交付文件（除非 7.1 发现需要修复的 bug，且修复不改变原有行为语义）
- **Phase 7 特例**：允许修改 `feature-flags.ts` 和 `app/community/page.tsx` 以移除 communityBeta 限制
- contract_version: 2.1.0-alpha.1
- 新建文件在 scripts/, e2e/
- 测试用 .mjs + node:test，与 Phase 1-6 一致

## 执行顺序

1. Task 7.1 — 先跑全量 verify + tests，修复失败项
2. Task 7.2 — 移除 Community 限制（依赖 7.1 确认无阻塞 bug）
3. Task 7.3 — 创建综合 Gate 验证脚本
4. Task 7.4 — 最终 E2E + 版本完成确认

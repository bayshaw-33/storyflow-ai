# KIIKIS 2.1 Phase 4：TRAE 任务文件

> 资源权利 + 项目级轻协作
> PRD 来源：§7 + §8
> Gate 3：资源权利
> 基线：main `f2a23963`（含 Phase 0-3）

## 分支

```
trae/K2-4-Phase4-grants-collab
基于：origin/main (f2a23963)
```

## 概述

Phase 4 实现资源出生即权利（RG-001~006）和项目级轻协作（CO-001~008），通过 Gate 3。

## 需求清单

### Task 4.1：资源出生即权利 (RG-001~006)

**RG-001：owner 只由服务端认证与创建事实决定**
- 资源（Universe/Project/Actor/Asset）创建时，owner_id 由服务端从认证用户写入
- 客户端不可指定 owner_id
- 有测试验证客户端传入 owner_id 被忽略

**RG-002：邀请 token 单次/限时/哈希存储**
- 邀请 token：`grant_token` 表，存哈希（不存明文）
- 单次使用（accepted 后 status=used）
- 限时过期（expires_at）
- 接受后绑定到接受者账号
- 有测试验证：过期 token 拒绝、已用 token 拒绝、哈希不泄露

**RG-003：grant + RLS 双重校验**
- 所有资源读取/操作：先 RLS（PostgREST 自动），再 grant 检查（应用层）
- grant 检查：`checkGrant(resourceType, resourceId, userId, requiredRelation)`
- RLS policy：owner 全权；collaboration/share/use/adaptation/license 按 grant scope
- 有测试验证：无 grant 用户被拒绝、有 grant 用户通过

**RG-004：撤销不删除历史**
- revoke grant → status=revoked，不删除记录
- 已生成衍生物的来源、版本、审计事实保留
- 有测试验证：撤销后历史可查

**RG-005：衍生物权利遵循创建时条款**
- 衍生物（adaptation）记录 source grant 的 terms 快照
- 后续权利不由前端猜测，以创建时条款为准
- 有测试验证：source grant 撤销后，已生成衍生物权利不变

**RG-006：所有权转移双方确认**
- 转移流程：owner 发起 → 接收方确认 → 记录前后 owner
- 转移审计记录：from_owner, to_owner, confirmed_at
- 有测试验证：单方发起不生效、双方确认后转移成功

**交付文件**：
- `supabase/migrations/20260827040000_kiikis_21_grants.sql` — grant + invite_token 表 + RLS + 索引
- `lib/contracts/v2/grants.ts` — GrantRelation, ResourceGrant, InviteToken 契约
- `lib/server/v2/grants/store.ts` — grant CRUD + checkGrant + 转移
- `lib/server/v2/grants/invite.ts` — 邀请 token 生成/验证/消费
- `app/api/v2/grants/route.ts` — grant 列表/创建
- `app/api/v2/grants/[id]/route.ts` — grant 撤销/详情
- `app/api/v2/grants/invite/route.ts` — 邀请创建
- `app/api/v2/grants/invite/accept/route.ts` — 邀请接受
- `app/api/v2/grants/transfer/route.ts` — 所有权转移
- `tests/kiikis-21-grants.test.mjs`

### Task 4.2：项目级轻协作 (CO-001~008)

**CO-001：角色体系**
- 角色：owner, editor, reviewer, viewer, asset_operator
- 角色绑定到 project/universe 范围
- 有测试验证角色权限矩阵

**CO-002：任务指派**
- 项目内任务可指派给有 collaboration grant 的成员
- 指派记录：assignee, assigned_by, assigned_at
- 有测试验证：无 grant 用户不可被指派

**CO-003：评论锚定稳定 ID**
- 评论锚定 resourceType + resourceId + version
- 不锚定数组下标或页面坐标
- 有测试验证：版本变化后评论仍可定位

**CO-004：审阅流程**
- 审阅状态：pending → in_review → approved / rejected
- 审阅记录：reviewer, status, comment, reviewed_at
- 有测试验证：审阅流程完整

**CO-005：批准/驳回**
- 批准/驳回记录原因和审阅人
- 驳回可附带修改建议
- 有测试验证

**CO-006：活动轨迹**
- 项目级活动流：创建、指派、评论、审阅、批准、驳回、grant 变更
- 活动记录锚定 resourceType + resourceId
- 有测试验证

**CO-007：通知**
- 重要事件触发通知（指派、审阅结果、grant 变更）
- 通知可读、已读、去重
- 复用 Phase 1 creative_events
- 有测试验证

**CO-008：个人账号所有权根**
- 不引入企业组织层级
- 个人账号始终是最终 owner
- 有测试验证

**交付文件**：
- `supabase/migrations/20260827040100_kiikis_21_collab.sql` — 评论/审阅/活动/通知表 + RLS
- `lib/contracts/v2/collab.ts` — Role, Comment, Review, Activity, Notification 契约
- `lib/server/v2/collab/comments.ts` — 评论服务
- `lib/server/v2/collab/reviews.ts` — 审阅服务
- `lib/server/v2/collab/activity.ts` — 活动轨迹服务
- `lib/server/v2/collab/notifications.ts` — 通知服务
- `app/api/v2/projects/[projectId]/comments/route.ts`
- `app/api/v2/projects/[projectId]/reviews/route.ts`
- `app/api/v2/projects/[projectId]/activity/route.ts`
- `app/api/v2/notifications/route.ts`
- `tests/kiikis-21-collab.test.mjs`

### Task 4.3：E2E + Verify

- `e2e/grants-collab.spec.ts` — 创建资源→邀请→接受→协作→审阅→撤销 E2E
- `scripts/verify-grants-collab.mjs` — 验证脚本

## Gate 3 判定标准

- Universe/Project/Actor/Asset 创建后即可邀请、分享、使用或授权
- grant/RLS 权限矩阵通过
- 撤销保留历史事实
- 无 P0/P1 权限漏洞

## 约束

- 不修改共享文件（package.json, pnpm-lock.yaml, middleware.ts, app/layout.tsx, components/AppShell.tsx, app/globals.css, lib/universe.ts）
- 不修改 Phase 0-3 已交付文件
- 不修改 lib/server/v2/feature-flags.ts
- contract_version: 2.1.0-alpha.1
- 新建文件在 lib/server/v2/grants/, lib/server/v2/collab/, lib/contracts/v2/, app/api/v2/, tests/
- 测试用 .mjs + node:test，与 Phase 1-3 一致

## 执行顺序

1. Task 4.1 (RG-001~006) — 先建表和契约，再实现服务，再写 API，最后测试
2. Task 4.2 (CO-001~008) — 依赖 4.1 的 grant 基础
3. Task 4.3 (E2E) — 最后补

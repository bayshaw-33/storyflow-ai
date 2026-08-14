# KIIKIS 2.1 Phase 5：TRAE 任务文件

> IP 资产社区 — 发现 / 关注 / 互动 / 审核 / 申诉
> PRD 来源：§9
> Gate 4：社区安全运营
> 基线：main `d7a9da23`（含 Phase 0-4）

## 分支

```
trae/K2-5-Phase5-community
基于：origin/main (d7a9da23)
```

## 概述

Phase 5 实现 IP 资产社区：Publication 发布与发现、关注/反应/收藏/评论、通知、举报/屏蔽/审核/申诉/恢复。通过 Gate 4。

依赖 Phase 1 creative_events（通知复用）和 Phase 4 grants（权限矩阵复用）。

## 需求清单

### Task 5.1：Publication 发布与发现 (CM-001~003, CM-005)

**CM-001：publication 与源资源分离**
- publication 保存：源资源快照（resourceType, resourceId, version）、发布者 ID、可见性（public/invite_only）
- publication 不等于源资源；隐藏 publication 不删除私有源（关联 CM-008）
- 有测试验证：发布后源资源仍可编辑，publication 保持发布时版本快照

**CM-002：发现页只读取允许公开/邀请访问的投影**
- 发现页查询 publication 投影表（非直接查私有资源表）
- 只返回 visibility=public 或 invite_only 且用户有 token 的 publication
- 社区首屏不等待私有详情和计数全量聚合（§12.2 性能要求）
- 有测试验证：私有资源不出现在发现页

**CM-003：关注、反应、收藏唯一且幂等**
- 关注（follow）：user → creator/universe，唯一约束 (follower_id, target_type, target_id)
- 反应（reaction）：like/love/wow 等，唯一约束 (user_id, publication_id, reaction_type)
- 收藏（bookmark）：唯一约束 (user_id, publication_id)
- 所有操作幂等：重复请求不创建重复记录
- 有测试验证：重复操作幂等

**CM-005：对象页明确来源、owner、许可状态和允许动作**
- publication 详情页显示：源资源类型与 ID、owner、当前 grant/许可状态、允许动作（关注/反应/收藏/评论/申请使用）
- 不暴露私有 storage path 或敏感信息
- 有测试验证

**交付文件**：
- `supabase/migrations/20260827050000_kiikis_21_community.sql` — publications + follows + reactions + bookmarks 表 + RLS + 索引
- `lib/contracts/v2/community.ts` — Publication, Follow, Reaction, Bookmark 契约
- `lib/server/v2/community/publications.ts` — 发布服务
- `lib/server/v2/community/discovery.ts` — 发现页投影查询
- `lib/server/v2/community/interactions.ts` — 关注/反应/收藏服务
- `app/api/v2/community/discover/route.ts` — 发现页 API
- `app/api/v2/community/publications/[id]/route.ts` — publication 详情
- `app/api/v2/community/follows/route.ts` — 关注/取消关注
- `app/api/v2/community/reactions/route.ts` — 反应
- `app/api/v2/community/bookmarks/route.ts` — 收藏
- `app/community/page.tsx` — 发现页（Gate 4 未通过前受 feature flag 保护，CM-010）
- `components/v2/community/PublicationCard.tsx`
- `components/v2/community/DiscoveryFeed.tsx`
- `tests/kiikis-21-community-publications.test.mjs`

### Task 5.2：评论与通知 (CM-004, CM-006)

**CM-004：评论支持回复、软删除、冻结和审核证据**
- 评论锚定 publication_id + parent_comment_id（回复）
- 软删除：deleted_at 标记，不物理删除
- 冻结：frozen_by + frozen_reason（审核冻结）
- 审核证据：冻结记录关联 moderation queue
- 有测试验证：回复层级、软删除、冻结

**CM-006：通知由事实事件生成**
- 通知由 creative_events 生成（复用 Phase 1 EV 架构）
- 通知类型：新关注、新评论、新反应、申请使用、审核结果
- 通知可读、已读、去重（同一事件不重复通知）
- 有测试验证

**交付文件**：
- `supabase/migrations/20260827050100_kiikis_21_comments.sql` — comments 表 + RLS
- `lib/contracts/v2/comments.ts` — Comment 契约
- `lib/server/v2/community/comments.ts` — 评论服务
- `lib/server/v2/community/notifications.ts` — 通知服务（复用 Phase 1 events）
- `app/api/v2/community/publications/[id]/comments/route.ts` — 评论列表/创建
- `app/api/v2/community/comments/[id]/route.ts` — 评论软删除
- `tests/kiikis-21-community-comments.test.mjs`

### Task 5.3：安全与审核 (CM-007~010)

**CM-007：举报、屏蔽、moderation queue、隐藏、恢复、申诉同时上线**
- 举报（report）：user → publication/comment，记录原因类型和描述
- 屏蔽（block）：user → user，屏蔽后互相不可见
- moderation queue：审核员查看举报队列，操作（隐藏/恢复/驳回）
- 隐藏 publication：visibility → hidden，不删除私有源（CM-008）
- 恢复：hidden → public，记录恢复原因
- 申诉（appeal）：被处罚用户提交申诉，审核员处理
- 有测试验证：完整流程 report → review → hide → appeal → restore

**CM-008：隐藏 publication 不删除私有源**
- 隐藏 publication 只改 publication 可见性
- 源 Project/Universe/Asset 不受影响
- 有测试验证

**CM-009：匿名、普通用户、被屏蔽用户和审核员权限矩阵自动化**
- 匿名用户：只能浏览 public publication
- 普通用户：浏览 + 互动（关注/反应/收藏/评论）
- 被屏蔽用户：看不到屏蔽者的内容
- 审核员：查看 moderation queue + 隐藏/恢复/驳回
- 权限矩阵由 RLS + 应用层校验双重保障
- 有测试验证：4 种角色权限矩阵

**CM-010：Gate 未通过前 /community 受 invite/feature flag 保护**
- /community 路由受 feature flag 保护（复用 Phase 1 FF 架构）
- Gate 4 未通过前，非邀请用户访问 /community 重定向或显示占位
- 有测试验证

**交付文件**：
- `supabase/migrations/20260827050200_kiikis_21_moderation.sql` — reports + blocks + moderation_queue + appeals 表 + RLS
- `lib/contracts/v2/moderation.ts` — Report, Block, ModerationAction, Appeal 契约
- `lib/server/v2/community/moderation.ts` — 举报/屏蔽/审核/申诉服务
- `lib/server/v2/community/permissions.ts` — 社区权限矩阵
- `app/api/v2/community/reports/route.ts` — 举报
- `app/api/v2/community/blocks/route.ts` — 屏蔽
- `app/api/v2/community/moderation/queue/route.ts` — 审核队列
- `app/api/v2/community/moderation/[id]/route.ts` — 审核操作（隐藏/恢复/驳回）
- `app/api/v2/community/appeals/route.ts` — 申诉
- `app/api/v2/community/appeals/[id]/route.ts` — 申诉处理
- `tests/kiikis-21-community-moderation.test.mjs`

### Task 5.4：E2E + Verify

- `e2e/community.spec.ts` — 发布→发现→关注→评论→举报→审核→申诉→恢复 E2E
- `scripts/verify-community.mjs` — 验证脚本

## Gate 4 判定标准

- 发现、关注、互动、通知和授权入口跑通
- 举报、屏蔽、审核、申诉、恢复跑通
- 无未解决 P0/P1 安全、隐私或审核缺陷

## 约束

- 不修改共享文件（package.json, pnpm-lock.yaml, middleware.ts, app/layout.tsx, components/AppShell.tsx, app/globals.css, lib/universe.ts）
- 不修改 Phase 0-4 已交付文件
- 不修改 lib/server/v2/feature-flags.ts
- contract_version: 2.1.0-alpha.1
- 新建文件在 lib/server/v2/community/, lib/contracts/v2/, app/api/v2/community/, app/community/, components/v2/community/, tests/, e2e/, scripts/
- 测试用 .mjs + node:test，与 Phase 1-4 一致
- /community 路由受 feature flag 保护（CM-010）

## 执行顺序

1. Task 5.1 (CM-001~003, 005) — 先建表和契约，再实现服务，再写 API 和页面，最后测试
2. Task 5.2 (CM-004, 006) — 依赖 5.1 的 publication 基础
3. Task 5.3 (CM-007~010) — 依赖 5.1 和 5.2
4. Task 5.4 (E2E) — 最后补

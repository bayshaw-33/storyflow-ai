# Phase 5：IP 资产社区、互动与治理

> 只执行本阶段。
> 需求：`K21-CM-001..010`
> 前置：Phase 3、4 COZE PASS
> 完成后交给：`COZE/05-Phase-5-IP资产社区与治理验证.md`

## 1. 目标

把 `/community` 从占位页升级为围绕真实 Work、Universe、Actor/Asset、生产里程碑和主动公开 KK 内容的邀请制社区，并同步上线举报、屏蔽、审核、申诉和恢复。

## 2. Task 5.1：Publication 与社区契约

**Files:**

- Create: `lib/contracts/v2/community.ts`
- Create: `tests/kiikis-21-community-contract.test.mjs`

```ts
type PublicationSubject = "work" | "universe" | "actor" | "asset" | "milestone" | "kk_showcase";
type PublicationStatus = "draft" | "published" | "hidden" | "withdrawn";
```

publication 固定 source resource/version、publisher、visibility、rights summary 和发布时间。禁止 `freeform_post`。

## 3. Task 5.2：数据、索引与 RLS

**Files:**

- Create: `supabase/migrations/20260827050000_kiikis_21_community.sql`
- Create: `supabase/migrations/audits/audit_kiikis_21_community.sql`
- Create: `tests/kiikis-21-community-migration.test.mjs`

表：publications、creator/universe follows、reactions、saves、comments、notifications、reports、blocks、moderation cases/actions/appeals。反应/收藏/关注使用唯一约束；评论软删除；计数是可重建 projection。

不要启用或改写 deferred `20260728000000_community_profile.sql`；按当前 schema 新增 forward migration。

## 4. Task 5.3：发布与发现 API

**Files:**

- Create: `lib/server/v2/community/publications.ts`
- Create: `app/api/v2/community/publications/route.ts`
- Create: `app/api/v2/community/feed/route.ts`
- Create: `app/api/v2/community/search/route.ts`
- Create: `tests/kiikis-21-community-publications.test.mjs`

- 发布前校验 owner/publish grant、源版本存在、visibility、rights summary。
- feed 只返回用户可见、未屏蔽、未隐藏投影。
- cursor pagination 稳定，不用 offset 漂移。
- 卡片必须包含 source ID/version、creator、rights state、允许动作。

## 5. Task 5.4：互动与通知

**Files:**

- Create: `app/api/v2/community/interactions/route.ts`
- Create: `app/api/v2/community/comments/route.ts`
- Create: `app/api/v2/community/notifications/route.ts`
- Create: `tests/kiikis-21-community-interactions.test.mjs`

每项互动幂等写入并发出 Creative Event；通知消费者按 event 去重。被 block 后双方新互动失败，feed 与评论按产品规则隐藏。

## 6. Task 5.5：举报、屏蔽、审核与申诉

**Files:**

- Create: `lib/server/v2/community/moderation.ts`
- Create: `app/api/v2/community/reports/route.ts`
- Create: `app/api/v2/community/blocks/route.ts`
- Create: `app/api/v2/admin/moderation/route.ts`
- Create: `app/api/v2/community/appeals/route.ts`
- Create: `tests/kiikis-21-community-moderation.test.mjs`

覆盖：重复举报、举报者隐私、block 即时生效、审核员隐藏 publication/冻结评论、理由与证据、恢复、申诉、管理员越权。隐藏 publication 不能删除源 Project/Universe/Actor/Asset。

## 7. Task 5.6：社区 UI

**Files:**

- Replace: `app/community/page.tsx`
- Replace: `app/community/community.module.css`
- Create: `components/v2/community/CommunityClient.tsx`
- Create: `components/v2/community/PublicationCard.tsx`
- Create: `components/v2/community/PublicationDetail.tsx`
- Create: `components/v2/community/CommunityComposer.tsx`
- Create: `components/v2/community/ModerationQueue.tsx`

UI 入口：发现、关注、收藏、通知；对象卡可进入源 Universe/Actor/Work，显示权利和使用/改编/授权入口。Composer 只能选择真实对象和版本，不能空白自由发帖。

Gate 前 `communityBeta` feature flag + invite 控制；未获邀请显示申请/说明，不展示无治理公开 feed。

## 8. Task 5.7：E2E

**Files:**

- Create: `e2e/community-object-loop.spec.ts`
- Create: `e2e/community-moderation.spec.ts`

两账号 + 审核员：发布 Universe、关注、收藏、评论、申请 use grant、举报、block、隐藏、申诉、恢复。验证源 Universe 始终存在。

## 9. 验证

```bash
node --test tests/kiikis-21-community-*.test.mjs
npx playwright test e2e/community-object-loop.spec.ts e2e/community-moderation.spec.ts --project=chromium
npx tsc --noEmit
pnpm build
```

## 10. 交付证据

- 真实对象 publication 与 source/version 证据。
- 互动幂等与通知去重。
- block 前后可见性截图。
- 举报→隐藏→申诉→恢复全录像；源资源未删除查询。
- feature flag 未开时公众不可访问证据。
- commit SHA、migration 和 audit 输出。

## 11. 禁止扩展

- 不做自由帖、私信、群聊、通用小组或生活内容。
- 不在治理未通过时移除邀请限制。
- 不把社区 publication 当所有权或 Canon 事实源。
